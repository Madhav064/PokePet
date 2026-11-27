import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.pokepet.pet"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    // The wallpaper and the over-apps pet run without the web page, so they read the
    // packs (manifest, evolution data and spritesheets) straight from the APK.
    // public/packs is written by `npm run web:build` (scripts/sync-packs.ts), which
    // Tauri runs before every Android build.
    sourceSets {
        getByName("main") {
            assets.srcDirs(file("../../../public/packs"))
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    implementation("androidx.appcompat:appcompat:1.6.0")
    implementation(project(":tauri-android"))
}
