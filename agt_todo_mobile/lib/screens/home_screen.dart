import 'dart:math';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../config/constants.dart';
import '../config/routes.dart';
import '../config/theme.dart';
import '../providers/language_provider.dart';
import '../services/notification_service.dart';
import '../widgets/mode_card.dart';
import '../widgets/toast.dart';

/// Landing page: gradient + floating circles, hero, two mode cards, stats, footer, EN/FR switch.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppPalette.heroGradient),
        child: Stack(
          children: [
            const Positioned.fill(child: _FloatingCircles()),
            SafeArea(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1100),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xl),
                    children: const [
                      Align(alignment: Alignment.centerRight, child: _LanguageSwitcher()),
                      SizedBox(height: AppSpacing.md),
                      _Hero(),
                      SizedBox(height: AppSpacing.xl),
                      _ModeCards(),
                      SizedBox(height: AppSpacing.xl),
                      _Stats(),
                      SizedBox(height: AppSpacing.xl),
                      _Footer(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(50)),
          child: Text('home.badge'.tr(), style: const TextStyle(color: Colors.white, fontSize: 14)),
        ),
        const SizedBox(height: AppSpacing.lg),
        // White → #ffd89b gradient text, like the web hero title.
        ShaderMask(
          shaderCallback: const LinearGradient(colors: [Colors.white, Color(0xFFFFD89B)]).createShader,
          child: Text(
            'home.title'.tr(),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800, color: Colors.white, height: 1.15),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          'home.subtitle'.tr(),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 18, color: Colors.white.withValues(alpha: 0.9)),
        ),
      ],
    );
  }
}

class _ModeCards extends StatelessWidget {
  const _ModeCards();

  @override
  Widget build(BuildContext context) {
    final classic = ModeCard(
      icon: '📝',
      title: 'home.classicTitle'.tr(),
      subtitle: 'home.classicSubtitle'.tr(),
      features: List.generate(6, (i) => 'home.classicFeatures.$i'.tr()),
      buttonLabel: 'home.classicLaunch'.tr(),
      onLaunch: () => context.go(AppRoutes.classic),
    );
    final programmable = ModeCard(
      icon: '⏰',
      title: 'home.programmableTitle'.tr(),
      subtitle: 'home.programmableSubtitle'.tr(),
      features: List.generate(6, (i) => 'home.programmableFeatures.$i'.tr()),
      buttonLabel: 'home.programmableLaunch'.tr(),
      onLaunch: () => context.go(AppRoutes.programmable),
    );

    return LayoutBuilder(builder: (context, constraints) {
      // Side by side in landscape / tablets, stacked on phones (web grid behaviour).
      if (constraints.maxWidth >= 700) {
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [Expanded(child: classic), const SizedBox(width: AppSpacing.lg), Expanded(child: programmable)],
          ),
        );
      }
      return Column(children: [classic, const SizedBox(height: AppSpacing.lg), programmable]);
    });
  }
}

/// Animated counters, same numbers as the web landing page.
class _Stats extends StatelessWidget {
  const _Stats();

  @override
  Widget build(BuildContext context) {
    Widget stat(String label, {int? target, String? fixed}) => Expanded(
          child: Column(
            children: [
              if (target != null)
                TweenAnimationBuilder<int>(
                  tween: IntTween(begin: 0, end: target),
                  duration: const Duration(seconds: 2),
                  curve: Curves.easeOut,
                  builder: (context, value, _) => _number(NumberFormat.decimalPattern(context.locale.languageCode).format(value)),
                )
              else
                _number(fixed!),
              const SizedBox(height: AppSpacing.xs),
              Text(label, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg, horizontal: AppSpacing.sm),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          stat('home.statTasks'.tr(), target: 1247),
          stat('home.statUsers'.tr(), fixed: '500+'),
          stat('home.statReminders'.tr(), target: 3421),
        ],
      ),
    );
  }

  static Widget _number(String text) =>
      Text(text, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Colors.white));
}

class _Footer extends StatelessWidget {
  const _Footer();

  void _info(BuildContext context, String title, String body, {String? link}) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(body),
            if (link != null) ...[const SizedBox(height: AppSpacing.sm), SelectableText(link)],
            const SizedBox(height: AppSpacing.md),
            Text('${AppConstants.appName} v${AppConstants.appVersion}', style: const TextStyle(fontSize: 12)),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text('common.close'.tr()))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final linkStyle = TextStyle(color: Colors.white.withValues(alpha: 0.9), decoration: TextDecoration.underline);
    final dot = Text(' • ', style: TextStyle(color: Colors.white.withValues(alpha: 0.7)));
    return Column(
      children: [
        Text('home.footer'.tr(), textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.9))),
        const SizedBox(height: AppSpacing.md),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(onTap: () => _info(context, 'home.about'.tr(), 'home.aboutText'.tr()), child: Text('home.about'.tr(), style: linkStyle)),
            dot,
            GestureDetector(
                onTap: () => _info(context, 'home.features'.tr(), 'home.featuresText'.tr()), child: Text('home.features'.tr(), style: linkStyle)),
            dot,
            GestureDetector(
              onTap: () => _info(context, 'home.contact'.tr(), 'home.contactText'.tr(), link: '${AppConstants.repoUrl}/issues'),
              child: Text('home.contact'.tr(), style: linkStyle),
            ),
          ],
        ),
      ],
    );
  }
}

/// 🇬🇧 English / 🇫🇷 Français pill (web .language-selector).
class _LanguageSwitcher extends StatelessWidget {
  const _LanguageSwitcher();

  @override
  Widget build(BuildContext context) {
    final language = context.watch<LanguageProvider>();
    final isFrench = language.isFrench(context);

    Widget button(String code, String label, bool active) => GestureDetector(
          onTap: () async {
            if (active) return;
            await language.setLanguage(context, code);
            await NotificationService.instance.reloadTexts();
            if (context.mounted) showToast(context, 'common.languageChanged'.tr());
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: active ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(30),
            ),
            child: Text(label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: active ? const Color(0xFF667EEA) : Colors.white)),
          ),
        );

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(30)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [button('en', '🇬🇧 English', !isFrench), button('fr', '🇫🇷 Français', isFrench)],
      ),
    );
  }
}

/// 15 translucent circles slowly floating (web .bg-animation).
class _FloatingCircles extends StatefulWidget {
  const _FloatingCircles();

  @override
  State<_FloatingCircles> createState() => _FloatingCirclesState();
}

class _FloatingCirclesState extends State<_FloatingCircles> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(seconds: 20))..repeat();
  final _circles = List.generate(15, (i) {
    final random = Random(i * 7919);
    return (
      x: random.nextDouble(),
      y: random.nextDouble(),
      size: random.nextDouble() * 200 + 50,
      phase: random.nextDouble(),
      speed: 1 + random.nextInt(2).toDouble(),
    );
  });

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => LayoutBuilder(
          builder: (context, constraints) => Stack(
            children: [
              for (final c in _circles)
                Positioned(
                  left: c.x * constraints.maxWidth - c.size / 2,
                  top: c.y * constraints.maxHeight - c.size / 2 + sin((_controller.value * c.speed + c.phase) * 2 * pi) * 20,
                  child: Container(
                    width: c.size,
                    height: c.size,
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
