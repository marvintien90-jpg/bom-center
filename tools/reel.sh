#!/usr/bin/env bash
# 用法：reel.sh 圖片資料夾 輸出.mp4 [每張秒數=3]
# 把資料夾裡 card-1.png, card-2.png… 依序做成 1080x1920 短片：每張緩慢放大、0.4 秒交叉淡入、無聲音軌。
set -euo pipefail
dir=$1; out=$2; sec=${3:-3}; fps=30
files=$(ls "$dir"/card-*.png | sort -V); n=$(echo "$files" | wc -l)
inputs=""; filt=""; i=0
for f in $files; do
  inputs="$inputs -i $f"
  filt="$filt[$i:v]scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xF3F1EC,zoompan=z='min(zoom+0.0007,1.06)':d=$((sec*fps)):x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=$fps,setsar=1[v$i];"
  i=$((i+1))
done
prev="v0"; off=0
for ((k=1;k<n;k++)); do
  off=$(python3 -c "print($k*$sec-$k*0.4)")
  filt="$filt[$prev][v$k]xfade=transition=slideleft:duration=0.4:offset=$off[x$k];"; prev="x$k"
done
total=$(python3 -c "print($n*$sec-($n-1)*0.4)")
ffmpeg -y -loglevel error $inputs -f lavfi -t "$total" -i anullsrc=r=44100:cl=stereo \
  -filter_complex "${filt}[$prev]format=yuv420p[v]" -map "[v]" -map $n:a \
  -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 128k -shortest -movflags +faststart "$out"
echo "$out $total"
