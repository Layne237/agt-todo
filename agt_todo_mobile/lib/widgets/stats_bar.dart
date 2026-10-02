import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Web .stats-bar: label + big accent number per stat.
class StatsBar extends StatelessWidget {
  const StatsBar({super.key, required this.items});

  /// (label, value) pairs.
  final List<(String, int)> items;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return LayoutBuilder(builder: (context, constraints) {
      // 4 per row on wide screens / landscape, 2 per row on phones.
      final perRow = constraints.maxWidth > 520 ? items.length : 2;
      final width = (constraints.maxWidth - AppSpacing.sm * (perRow - 1)) / perRow;
      return Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final (label, value) in items)
            Container(
              width: width,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: p.bgPrimary,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: p.border),
              ),
              child: Column(
                children: [
                  Text(label, style: TextStyle(fontSize: 12, color: p.textSecondary), textAlign: TextAlign.center),
                  const SizedBox(height: AppSpacing.xs),
                  Text('$value', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppPalette.accent)),
                ],
              ),
            ),
        ],
      );
    });
  }
}
