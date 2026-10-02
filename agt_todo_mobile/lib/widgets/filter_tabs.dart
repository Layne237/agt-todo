import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Web .tab-btn / .filter-btn row: one pill per filter, the selected one filled.
class FilterTabs<T> extends StatelessWidget {
  const FilterTabs({super.key, required this.values, required this.labelOf, required this.selected, required this.onSelected});

  final List<T> values;
  final String Function(T) labelOf;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final value in values)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: ChoiceChip(
                label: Text(labelOf(value)),
                selected: value == selected,
                showCheckmark: false,
                onSelected: (_) => onSelected(value),
                selectedColor: AppPalette.accent,
                backgroundColor: p.bgPrimary,
                side: BorderSide(color: value == selected ? AppPalette.accent : p.border),
                labelStyle: TextStyle(
                  color: value == selected ? Colors.white : p.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
              ),
            ),
        ],
      ),
    );
  }
}
