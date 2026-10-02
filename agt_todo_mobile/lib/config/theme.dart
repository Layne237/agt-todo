import 'package:flutter/material.dart';

/// Design tokens copied from the web app's shared/css/common.css.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.bgPrimary,
    required this.bgSecondary,
    required this.textPrimary,
    required this.textSecondary,
    required this.border,
  });

  final Color bgPrimary;
  final Color bgSecondary;
  final Color textPrimary;
  final Color textSecondary;
  final Color border;

  static const accent = Color(0xFF6366F1);
  static const accentHover = Color(0xFF4F46E5);
  static const danger = Color(0xFFEF4444);
  static const dangerHover = Color(0xFFDC2626);
  static const success = Color(0xFF10B981);
  static const warning = Color(0xFFF59E0B);

  /// Landing page gradient (#667eea → #764ba2).
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF667EEA), Color(0xFF764BA2)],
  );

  static const light = AppPalette(
    bgPrimary: Color(0xFFF9F9FF),
    bgSecondary: Color(0xFFFFFFFF),
    textPrimary: Color(0xFF111111),
    textSecondary: Color(0xFF666666),
    border: Color(0xFFE0E0E0),
  );

  static const dark = AppPalette(
    bgPrimary: Color(0xFF1E1E2F),
    bgSecondary: Color(0xFF2A2A3B),
    textPrimary: Color(0xFFEEEEEE),
    textSecondary: Color(0xFFA0A0A0),
    border: Color(0xFF3A3A4A),
  );

  static AppPalette of(BuildContext context) => Theme.of(context).extension<AppPalette>()!;

  @override
  AppPalette copyWith({Color? bgPrimary, Color? bgSecondary, Color? textPrimary, Color? textSecondary, Color? border}) =>
      AppPalette(
        bgPrimary: bgPrimary ?? this.bgPrimary,
        bgSecondary: bgSecondary ?? this.bgSecondary,
        textPrimary: textPrimary ?? this.textPrimary,
        textSecondary: textSecondary ?? this.textSecondary,
        border: border ?? this.border,
      );

  @override
  AppPalette lerp(AppPalette? other, double t) {
    if (other == null) return this;
    return AppPalette(
      bgPrimary: Color.lerp(bgPrimary, other.bgPrimary, t)!,
      bgSecondary: Color.lerp(bgSecondary, other.bgSecondary, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      border: Color.lerp(border, other.border, t)!,
    );
  }
}

/// Radii and spacing from the web app (--radius-*, --spacing-*).
class AppRadius {
  AppRadius._();
  static const sm = 6.0;
  static const md = 12.0;
  static const lg = 16.0;
}

class AppSpacing {
  AppSpacing._();
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
}

class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(Brightness.light, AppPalette.light);
  static ThemeData dark() => _build(Brightness.dark, AppPalette.dark);

  static ThemeData _build(Brightness brightness, AppPalette p) {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppPalette.accent,
      brightness: brightness,
      primary: AppPalette.accent,
      error: AppPalette.danger,
      surface: p.bgSecondary,
    );
    final inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.md),
      borderSide: BorderSide(color: p.border, width: 2),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: p.bgPrimary,
      extensions: [p],
      // System UI font, like the web app (-apple-system / Segoe UI / Roboto) - works offline.
      appBarTheme: AppBarTheme(
        backgroundColor: p.bgSecondary,
        foregroundColor: p.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: p.textPrimary),
        shape: Border(bottom: BorderSide(color: p.border)),
      ),
      cardTheme: CardThemeData(
        color: p.bgSecondary,
        elevation: 1,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.bgPrimary,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 14),
        border: inputBorder,
        enabledBorder: inputBorder,
        focusedBorder: inputBorder.copyWith(borderSide: const BorderSide(color: AppPalette.accent, width: 2)),
        errorBorder: inputBorder.copyWith(borderSide: const BorderSide(color: AppPalette.danger, width: 2)),
        hintStyle: TextStyle(color: p.textSecondary),
        labelStyle: TextStyle(color: p.textSecondary),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppPalette.accent,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.textPrimary,
          side: BorderSide(color: p.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? AppPalette.accent : null,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        contentTextStyle: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
      ),
      dividerColor: p.border,
    );
  }
}
