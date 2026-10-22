import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-cartesian-dist-min'
import type ReactPlotly from 'react-plotly.js'

// Cartesian-only Plotly build (scatter, bar, heatmap): about a third of the size of the full one
const Plot = createPlotlyComponent(Plotly as any) as unknown as typeof ReactPlotly
export default Plot
