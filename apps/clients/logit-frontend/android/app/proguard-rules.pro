# LogIt release (R8) keep rules.
#
# Capacitor bridges plugins to JS by reflection, so every plugin class, its
# @PluginMethod methods, and anything the WebView calls into must survive
# shrinking/obfuscation. Most Capacitor plugins ship consumer rules, but we keep
# the set explicitly so a release build can't silently lose a native call.

# Keep line numbers for readable crash traces (class names are still obfuscated).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Capacitor core -------------------------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Cordova plugins shimmed by Capacitor -------------------------------------
-keep class org.apache.cordova.** { *; }
-keep class * extends org.apache.cordova.CordovaPlugin { *; }

# --- App entry points & local plugins ----------------------------------------
-keep class ie.logit.app.** { *; }

# --- @capacitor-community/sqlite ---------------------------------------------
-keep class com.getcapacitor.community.database.sqlite.** { *; }
-dontwarn org.spongycastle.**
-dontwarn org.bouncycastle.**

# --- @capacitor-mlkit/* + Google ML Kit ------------------------------------
-keep class io.capawesome.capacitorjs.plugins.mlkit.** { *; }
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-dontwarn com.google.mlkit.**

# --- @capawesome/capacitor-file-picker -------------------------------------
-keep class io.capawesome.capacitorjs.plugins.filepicker.** { *; }

# --- capacitor-secure-storage-plugin --------------------------------------
-keep class com.whitestein.securestorage.** { *; }

# --- Capacitor official plugins (app, camera, haptics, keyboard,
#     local-notifications, splash-screen, status-bar) ----------------------
-keep class com.capacitorjs.plugins.** { *; }

# AndroidX / Play Services occasionally reference missing optional classes.
-dontwarn kotlin.**
-dontwarn kotlinx.**
