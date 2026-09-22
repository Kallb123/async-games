/**
 * Shared ceiling for a locally-picked image file previewed by a build-time
 * authoring screen (the Race Cars track editor's traced backdrop, the
 * Kingdom Builder tile mapper's sheet upload) before it's committed
 * anywhere. Loading an unbounded file into an `<img>`/canvas can freeze the
 * tab; each screen still writes its own error message, since what the image
 * is *for* differs, but the number belongs in one place.
 */
export const MAX_LOCAL_IMAGE_BYTES = 25 * 1024 * 1024;
