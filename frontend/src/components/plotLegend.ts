/**
 * Legend drawn inside the plot area (top left).
 *
 * Plotly puts a legend outside the plot by default (to the right, or above when it is horizontal) and takes the room
 * from the chart: the plot gets narrower or shorter the moment a second trace appears. Inside the plot nothing moves.
 */
export const LEGEND_INSIDE = {
  x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top',
  font: { size: 10, color: '#8ab4c9' },
  bgcolor: 'rgba(17,28,40,0.7)',
} as const
