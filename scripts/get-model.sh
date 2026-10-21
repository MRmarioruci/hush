#!/usr/bin/env bash
# Downloads the YAMNet cry-detection model (Apache 2.0) to $1 and checks the class
# indices the detector relies on. Used by the Android and iOS builds.
set -euo pipefail
DEST="$1"
mkdir -p "$(dirname "$DEST")"
size() { if stat -c%s "$1" >/dev/null 2>&1; then stat -c%s "$1"; else stat -f%z "$1"; fi; }
get() { curl -fsSL --retry 3 -o "$DEST" "$1" && [ "$(size "$DEST")" -gt 1000000 ]; }
TMP="${RUNNER_TEMP:-/tmp}"
get "https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/audio_classification/android/lite-model_yamnet_classification_tflite_1.tflite" \
  || get "https://tfhub.dev/google/lite-model/yamnet/classification/tflite/1?lite-format=tflite" \
  || { curl -fsSL --retry 3 -o "$TMP/yamnet.tgz" "https://www.kaggle.com/api/v1/models/google/yamnet/tfLite/classification-tflite/1/download" \
       && tar -xzf "$TMP/yamnet.tgz" -C "$TMP" && cp "$(ls "$TMP"/*.tflite | head -1)" "$DEST"; } \
  || { echo "::error::Could not download the YAMNet model"; exit 1; }
echo "model size $(size "$DEST")"
# The detector reads classes by index; make sure they still mean what it expects.
curl -fsSL --retry 3 -o "$TMP/classes.csv" https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv
check() { LINE=$(grep "^$1," "$TMP/classes.csv"); echo "class $1: $LINE"; echo "$LINE" | grep -q "$2" || { echo "::error::YAMNet class $1 is not '$2': $LINE"; exit 1; }; }
check 0 "Speech"; check 1 "Child speech"; check 4 "Babbling"; check 13 "Laughter"; check 14 "Baby laughter"
check 19 "Crying, sobbing"; check 20 "Baby cry, infant cry"; check 21 "Whimper"; check 22 "Wail, moan"; check 11 "Screaming"
