#!/bin/bash
# Merge all source files into a single file for AI Studio import
# Original files remain untouched

OUTPUT="merged_codebase.txt"
echo "# TriangleListAI - Merged Codebase for AI Analysis" > $OUTPUT
echo "# Generated: $(date)" >> $OUTPUT
echo "# This file is for AI Studio import. Original files are preserved." >> $OUTPUT
echo "" >> $OUTPUT

# Define file order (config files first, then dependencies)
FILES=(
  "package.json"
  "index.html"
  "types.ts"
  "constants.ts"
  "utils/geometryUtils.ts"
  "utils/dxfExport.ts"
  "components/GeometryCanvas.tsx"
  "App.tsx"
  "index.tsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "//===============================================================================" >> $OUTPUT
    echo "// FILE: $file" >> $OUTPUT
    echo "//===============================================================================" >> $OUTPUT
    cat "$file" >> $OUTPUT
    echo "" >> $OUTPUT
    echo "" >> $OUTPUT
  fi
done

echo "Merged ${#FILES[@]} files into $OUTPUT"
