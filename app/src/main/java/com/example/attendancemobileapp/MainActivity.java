package com.example.attendancemobileapp;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.activity.EdgeToEdge;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.material.button.MaterialButton;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final long COUNTDOWN_UPDATE_MS = 250L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final Runnable countdownRunnable = new Runnable() {
        @Override
        public void run() {
            updateCountdown();
        }
    };

    private GoogleSignInClient googleSignInClient;
    private ActivityResultLauncher<Intent> signInLauncher;
    private MaterialButton signInButton;
    private MaterialButton signOutButton;
    private MaterialButton retryQrButton;
    private View qrCard;
    private View studentDetailsCard;
    private ImageView qrImage;
    private TextView countdownText;
    private TextView statusText;
    private TextView accountStatus;
    private TextView studentName;
    private TextView studentRoll;
    private TextView studentSemester;
    private String backendAccessToken;
    private long qrExpiresAt;
    private boolean qrRequestInFlight;
    private int authGeneration;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main), (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        signInButton = findViewById(R.id.google_sign_in);
        signOutButton = findViewById(R.id.sign_out);
        retryQrButton = findViewById(R.id.retry_qr);
        qrCard = findViewById(R.id.attendance_qr_card);
        studentDetailsCard = findViewById(R.id.student_details_card);
        qrImage = findViewById(R.id.student_qr);
        countdownText = findViewById(R.id.qr_countdown);
        statusText = findViewById(R.id.status_message);
        accountStatus = findViewById(R.id.account_status);
        studentName = findViewById(R.id.student_name);
        studentRoll = findViewById(R.id.student_roll);
        studentSemester = findViewById(R.id.student_semester);

        GoogleSignInOptions signInOptions = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .requestIdToken(getString(R.string.default_web_client_id))
                .build();
        googleSignInClient = GoogleSignIn.getClient(this, signInOptions);

        signInLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (result.getResultCode() != RESULT_OK || result.getData() == null) {
                        showStatus(getString(R.string.sign_in_cancelled));
                        return;
                    }
                    try {
                        GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(result.getData())
                                .getResult(ApiException.class);
                        if (account == null) {
                            showStatus(getString(R.string.google_token_missing));
                            return;
                        }
                        authenticateWithBackend(account);
                    } catch (ApiException exception) {
                        showStatus(getString(R.string.google_sign_in_failed, exception.getStatusCode()));
                    }
                }
        );

        signInButton.setOnClickListener(view -> signInLauncher.launch(googleSignInClient.getSignInIntent()));
        signOutButton.setOnClickListener(view -> signOut());
        retryQrButton.setOnClickListener(view -> fetchAttendanceQr());

        GoogleSignInAccount previousAccount = GoogleSignIn.getLastSignedInAccount(this);
        if (previousAccount != null) {
            showStatus(getString(R.string.reconnecting_account));
            googleSignInClient.silentSignIn().addOnCompleteListener(this, task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    authenticateWithBackend(task.getResult());
                } else {
                    showSignedOut();
                }
            });
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (backendAccessToken != null) {
            updateCountdown();
        }
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(countdownRunnable);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(countdownRunnable);
        networkExecutor.shutdownNow();
        super.onDestroy();
    }

    private void authenticateWithBackend(GoogleSignInAccount account) {
        String idToken = account.getIdToken();
        if (idToken == null || idToken.isEmpty()) {
            showStatus(getString(R.string.google_token_missing));
            return;
        }

        signInButton.setEnabled(false);
        showStatus(getString(R.string.signing_in));
        networkExecutor.execute(() -> {
            try {
                JSONObject payload = new JSONObject().put("credential", idToken);
                JSONObject session = requestJson("POST", "auth/google", payload, null);
                JSONObject user = session.getJSONObject("user");
                JSONObject onboarding = session.optJSONObject("onboarding");
                String accessToken = session.getString("access_token");

                runOnUiThread(() -> {
                    signInButton.setEnabled(true);
                    if (!"student".equals(user.optString("role"))) {
                        showSignedOut();
                        showStatus(getString(R.string.student_account_only));
                        return;
                    }
                    authGeneration++;
                    backendAccessToken = accessToken;
                    signInButton.setVisibility(View.GONE);
                    signOutButton.setVisibility(View.VISIBLE);
                    accountStatus.setText(R.string.signed_in);
                    studentName.setText(user.optString("name", getString(R.string.student_name_placeholder)));
                    studentDetailsCard.setVisibility(View.VISIBLE);

                    if (onboarding == null || !onboarding.optBoolean("complete")) {
                        qrCard.setVisibility(View.GONE);
                        showStatus(getString(R.string.registration_required));
                        return;
                    }
                    showStatus(getString(R.string.requesting_attendance_qr));
                    fetchAttendanceQr();
                });
            } catch (Exception exception) {
                runOnUiThread(() -> {
                    signInButton.setEnabled(true);
                    showSignedOut();
                    showStatus(readableError(exception));
                });
            }
        });
    }

    private void fetchAttendanceQr() {
        if (backendAccessToken == null || qrRequestInFlight) {
            return;
        }

        qrRequestInFlight = true;
        int requestGeneration = authGeneration;
        long requestStartedAt = SystemClock.elapsedRealtime();
        networkExecutor.execute(() -> {
            try {
                JSONObject response = requestJson("GET", "students/me/attendance-qr", null, backendAccessToken);
                String token = response.getString("token");
                int expiresIn = response.getInt("expires_in");
                JSONObject student = response.getJSONObject("student");
                Bitmap qrBitmap = createQrBitmap(token);

                runOnUiThread(() -> {
                    qrRequestInFlight = false;
                    if (backendAccessToken == null || authGeneration != requestGeneration) {
                        return;
                    }
                    qrImage.setImageBitmap(qrBitmap);
                    qrCard.setVisibility(View.VISIBLE);
                    retryQrButton.setVisibility(View.GONE);
                    studentName.setText(student.optString("name", getString(R.string.student_name_placeholder)));
                    studentRoll.setText(getString(R.string.student_roll_value, student.optString("roll", "")));
                    studentSemester.setText(getString(
                            R.string.student_semester_value,
                            student.optString("semester", "")
                    ));
                    qrExpiresAt = requestStartedAt + expiresIn * 1000L;
                    showStatus(getString(R.string.qr_ready));
                    updateCountdown();
                });
            } catch (Exception exception) {
                runOnUiThread(() -> {
                    qrRequestInFlight = false;
                    if (backendAccessToken == null || authGeneration != requestGeneration) {
                        return;
                    }
                    qrCard.setVisibility(View.GONE);
                    retryQrButton.setVisibility(View.VISIBLE);
                    showStatus(readableError(exception));
                });
            }
        });
    }

    private void updateCountdown() {
        if (backendAccessToken == null || qrCard.getVisibility() != View.VISIBLE) {
            return;
        }
        long remainingMs = qrExpiresAt - SystemClock.elapsedRealtime();
        if (remainingMs <= 0) {
            qrImage.setImageDrawable(null);
            countdownText.setText(R.string.qr_refreshing);
            showStatus(getString(R.string.refreshing_attendance_qr));
            fetchAttendanceQr();
            return;
        }

        long remainingSeconds = (remainingMs + 999) / 1000;
        countdownText.setText(String.format(
                Locale.getDefault(),
                "%02d:%02d",
                remainingSeconds / 60,
                remainingSeconds % 60
        ));
        handler.removeCallbacks(countdownRunnable);
        handler.postDelayed(countdownRunnable, COUNTDOWN_UPDATE_MS);
    }

    private void signOut() {
        handler.removeCallbacks(countdownRunnable);
        authGeneration++;
        backendAccessToken = null;
        qrExpiresAt = 0;
        qrRequestInFlight = false;
        qrImage.setImageDrawable(null);
        qrCard.setVisibility(View.GONE);
        retryQrButton.setVisibility(View.GONE);
        studentDetailsCard.setVisibility(View.GONE);
        googleSignInClient.signOut().addOnCompleteListener(this, task -> showSignedOut());
    }

    private void showSignedOut() {
        backendAccessToken = null;
        qrCard.setVisibility(View.GONE);
        retryQrButton.setVisibility(View.GONE);
        studentDetailsCard.setVisibility(View.GONE);
        signInButton.setVisibility(View.VISIBLE);
        signInButton.setEnabled(true);
        signOutButton.setVisibility(View.GONE);
        accountStatus.setText(R.string.signed_out);
        showStatus(getString(R.string.sign_in_to_continue));
    }

    private void showStatus(String message) {
        statusText.setText(message);
    }

    private JSONObject requestJson(String method, String path, JSONObject body, String bearerToken)
            throws IOException, JSONException {
        String baseUrl = BuildConfig.API_BASE_URL.endsWith("/")
                ? BuildConfig.API_BASE_URL
                : BuildConfig.API_BASE_URL + "/";
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setRequestProperty("Accept", "application/json");
        if (bearerToken != null) {
            connection.setRequestProperty("Authorization", "Bearer " + bearerToken);
        }
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }

        try {
            int responseCode = connection.getResponseCode();
            InputStream responseStream = responseCode >= 200 && responseCode < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String responseBody = readStream(responseStream);
            JSONObject response = new JSONObject(responseBody);
            if (responseCode < 200 || responseCode >= 300) {
                throw new IOException(response.optString("detail", getString(R.string.request_failed)));
            }
            return response;
        } finally {
            connection.disconnect();
        }
    }

    private static String readStream(InputStream inputStream) throws IOException {
        if (inputStream == null) {
            return "{}";
        }
        StringBuilder content = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line);
            }
        }
        return content.toString();
    }

    private Bitmap createQrBitmap(String value) throws WriterException {
        int size = 720;
        BitMatrix matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, size, size);
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                bitmap.setPixel(x, y, matrix.get(x, y) ? Color.BLACK : Color.WHITE);
            }
        }
        return bitmap;
    }

    private String readableError(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isEmpty() ? getString(R.string.request_failed) : message;
    }
}
