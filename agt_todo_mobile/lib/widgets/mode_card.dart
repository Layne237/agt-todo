import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Landing-page mode card (web .mode-card): glassy card with icon, title,
/// subtitle, six feature bullets and a launch button. The whole card is tappable.
class ModeCard extends StatefulWidget {
  const ModeCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.features,
    required this.buttonLabel,
    required this.onLaunch,
  });

  final String icon;
  final String title;
  final String subtitle;
  final List<String> features;
  final String buttonLabel;
  final VoidCallback onLaunch;

  @override
  State<ModeCard> createState() => _ModeCardState();
}

class _ModeCardState extends State<ModeCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: _pressed ? 0.97 : 1,
      duration: const Duration(milliseconds: 150),
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: (_) => setState(() => _pressed = false),
        onTap: widget.onLaunch,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 30, offset: const Offset(0, 15)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(widget.icon, style: const TextStyle(fontSize: 48)),
              const SizedBox(height: AppSpacing.sm),
              // Gradient title, like the web's background-clip: text.
              ShaderMask(
                shaderCallback: AppPalette.heroGradient.createShader,
                child: Text(widget.title, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                widget.subtitle,
                style: const TextStyle(fontSize: 14, color: Color(0xFF666666)),
              ),
              const SizedBox(height: AppSpacing.md),
              for (final feature in widget.features)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      Container(
                        width: 22,
                        height: 22,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(gradient: AppPalette.heroGradient, shape: BoxShape.circle),
                        child: const Text('✓', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(width: AppSpacing.sm + 2),
                      Expanded(child: Text(feature, style: const TextStyle(color: Color(0xFF555555), fontSize: 15))),
                    ],
                  ),
                ),
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                width: double.infinity,
                child: DecoratedBox(
                  decoration: BoxDecoration(gradient: AppPalette.heroGradient, borderRadius: BorderRadius.circular(50)),
                  child: TextButton(
                    onPressed: widget.onLaunch,
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    child: Text(widget.buttonLabel),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
