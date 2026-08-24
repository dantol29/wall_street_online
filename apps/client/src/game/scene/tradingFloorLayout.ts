/**
 * Positions/content for the room's native 3D market ticker and world clocks.
 */

/**
 * Ticker + clock assembly: hangs directly above the center of the trading pit
 * (x=0, z=0), mounted a few metres above the floor — an 80s-exchange LED sign,
 * not a modern digital dashboard. The ticker itself was sized up from the
 * original ~6.5m-wide brief per explicit follow-up feedback ("make it
 * bigger"), so it reads clearly as the room's dominant visual anchor.
 */
const ASSEMBLY_CENTER_X = 0;
const ASSEMBLY_CENTER_Z = 0;

/** Ticker: matte black steel box. */
export const TICKER_SIZE: [number, number, number] = [9, 0.6, 0.28];
export const TICKER_PANEL_POSITION: [number, number, number] = [ASSEMBLY_CENTER_X, 8.7, ASSEMBLY_CENTER_Z];
/** Two black steel suspension rods, inset from the ticker's own ends. */
export const TICKER_ROD_X_OFFSET = 4.0;

export const TICKER_TEXT =
  "DOW JONES 2,856.31 ▲12.44     S&P 500 327.16 ▲2.18     BTC 118,421 ▲3.2%     ETH 4,128 ▼0.8%     HYPE 46.12 ▲5.7%     ";

export const CLOCK_LABELS = ["NEW YORK", "LONDON", "TOKYO", "HONG KONG"];

/** The white painted-metal panel the four clocks are mounted on, directly beneath the ticker — reintroduced per explicit request ("clocks should be in a component like on an image"), matching the reference image's single housing rather than four independently-floating clocks. */
export const CLOCK_BOARD_POSITION: [number, number, number] = [0, 7.25, 0];
export const CLOCK_BOARD_SIZE: [number, number, number] = [4.4, 1.5, 0.15];

/**
 * Four equally-spaced clocks (1m pitch — widened from the earlier 0.95m pitch
 * to fit the larger clocks without overlap) centered on the clock board,
 * slightly proud of its front face (board half-thickness 0.075 + a small
 * clearance) so there's no z-fighting.
 */
export const CLOCK_POSITIONS: Array<[number, number, number]> = [
  [-1.5, 7.25, 0.13],
  [-0.5, 7.25, 0.13],
  [0.5, 7.25, 0.13],
  [1.5, 7.25, 0.13],
];
