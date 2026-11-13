export type StudyAreaPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export async function createStudyAreaMap(
  point: StudyAreaPoint,
  authorizationHeaders: Record<string, string>,
  zoom = 14,
): Promise<Blob> {
  const width = 768;
  const height = 512;
  const tileSize = 256;
  const count = 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, point.latitude));
  const radians = (latitude * Math.PI) / 180;
  const centerX = ((point.longitude + 180) / 360) * count;
  const centerY = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * count;
  const centerPixelX = centerX * tileSize;
  const centerPixelY = centerY * tileSize;
  const left = centerPixelX - width / 2;
  const top = centerPixelY - height / 2;
  const firstTileX = Math.floor(left / tileSize);
  const firstTileY = Math.floor(top / tileSize);
  const lastTileX = Math.floor((left + width - 1) / tileSize);
  const lastTileY = Math.floor((top + height - 1) / tileSize);
  const tileCount = (lastTileX - firstTileX + 1) * (lastTileY - firstTileY + 1);
  if (tileCount > 16) throw new Error("The selected map area is too large to render.");

  const tiles = await Promise.all(
    Array.from({ length: tileCount }, async (_, index) => {
      const columns = lastTileX - firstTileX + 1;
      const x = firstTileX + (index % columns);
      const y = firstTileY + Math.floor(index / columns);
      if (y < 0 || y >= count) throw new Error("The selected map area is outside the available map coverage.");
      const wrappedX = ((x % count) + count) % count;
      const response = await fetch(`/api/research/map/tiles/${zoom}/${wrappedX}/${y}`, {
        headers: authorizationHeaders,
        cache: "force-cache",
      });
      if (!response.ok) {
        throw new Error(`Map tile request failed (${response.status}). Check your connection and try again.`);
      }
      return { x, y, image: await createImageBitmap(await response.blob()) };
    }),
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    tiles.forEach((tile) => tile.image.close());
    throw new Error("This browser cannot create the study-area map image.");
  }

  context.fillStyle = "#f3f1e9";
  context.fillRect(0, 0, width, height);
  for (const tile of tiles) {
    const x = Math.round(tile.x * tileSize - left);
    const y = Math.round(tile.y * tileSize - top);
    context.drawImage(tile.image, x, y, tileSize, tileSize);
    tile.image.close();
  }

  const markerX = centerPixelX - left;
  const markerY = centerPixelY - top;
  context.beginPath();
  context.arc(markerX, markerY, 10, 0, Math.PI * 2);
  context.fillStyle = "#a32020";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "#ffffff";
  context.stroke();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The study-area map could not be encoded."));
    }, "image/png");
  });
}
