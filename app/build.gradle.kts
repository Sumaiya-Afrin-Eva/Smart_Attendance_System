plugins {
    alias(libs.plugins.android.application)
    id("com.google.gms.google-services")

}

val attendanceApiBaseUrl = providers.gradleProperty("attendanceApiBaseUrl")
    .orElse("http://10.0.2.2:8000/api/")

android {
    namespace = "com.example.attendancemobileapp"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.example.attendancemobileapp"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"${attendanceApiBaseUrl.get()}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.activity.ktx)
    implementation(libs.appcompat)
    implementation(libs.constraintlayout)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(libs.ext.junit)
    implementation(platform("com.google.firebase:firebase-bom:35.0.2"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.google.android.gms:play-services-auth:21.4.0")
}