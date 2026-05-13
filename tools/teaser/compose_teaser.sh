#!/bin/bash
set -euo pipefail
cd /home/user/workspace

# Concat the teaser visual segments (30s total)
cat > /tmp/teaser_concat.txt <<EOF
file '/tmp/teaser_seg/01_title.mp4'
file '/tmp/teaser_seg/02_med.mp4'
file '/tmp/teaser_seg/03_tools.mp4'
file '/tmp/teaser_seg/04_shapes.mp4'
file '/tmp/teaser_seg/05_cta.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i /tmp/teaser_concat.txt -c copy /tmp/teaser_video_only.mp4

# Trim audio to exactly 30s, fade out at end
ffmpeg -y -i /tmp/teaser_video_only.mp4 -i teaser_script.mp3 \
  -filter_complex "[1:a]apad,atrim=duration=30,afade=t=out:st=28:d=2[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 192k -t 30 \
  /home/user/workspace/beacon-teaser-30s.mp4

ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_name -of default /home/user/workspace/beacon-teaser-30s.mp4
ls -la /home/user/workspace/beacon-teaser-30s.mp4
