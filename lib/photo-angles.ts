import type { PendingPhoto } from "./photos";

export const guidedPhotoAngles = ["Frente", "Traseira"] as const;
export type PhotoAngle = (typeof guidedPhotoAngles)[number];

export type GuidedPhotoState = {
  currentIndex: number;
  skipped: string[];
  resumeIndex: number | null;
};

export function hasFrontAndBack(photos: Pick<PendingPhoto, "angulo">[]): boolean {
  return guidedPhotoAngles.every((angle) =>
    photos.some((photo) => photo.angulo === angle),
  );
}

/** Rascunhos antigos podem ter sete ângulos; guardar só os dois solicitados.
 *  Não altera imagens já registradas em ordens anteriores. */
export function onlyFrontAndBack(photos: PendingPhoto[]): PendingPhoto[] {
  return guidedPhotoAngles.flatMap((angle) => {
    const found = [...photos].reverse().find((photo) => photo.angulo === angle);
    return found ? [found] : [];
  });
}
