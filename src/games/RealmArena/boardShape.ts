// The shape both of Realm Arena's boards are drawn to, kept out of ui.ts so the
// 3D board's geometry (three/iso3d.ts) needn't import the whole of it.

/**
 * The least the board's height may be as a fraction of its width, however it is
 * drawn: an isometric map is twice as wide as it's tall, which fitted to a
 * phone would leave a strip of a frame to pan around in once zoomed. Raised
 * from 0.62 for a little more battlefield on a phone; much more and the
 * controls under it fall off the first screen.
 */
export const MIN_ASPECT = 0.7;
