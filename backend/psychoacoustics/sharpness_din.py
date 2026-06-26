import numpy as np
from mosqito.sq_metrics import sharpness_din_st
from psychoacoustics.loudness import Loudness

loud_zwk = Loudness()

class Sharpnes_DIN():
    def __init__(self):
        super(Sharpnes_DIN, self).__init__()        
            
    def sharpnessCalculation(self, timeData, samplingRate):
        # Bark scale
        Bark = np.arange(0.1, 24.1, 0.1)
        globalSharpness = 0
        specificSharpness = 0
        if len(timeData) > 0:
            globalSharpness = sharpness_din_st(timeData, samplingRate, weighting="din")
            Bark, _, sL, *_ = loud_zwk.loudnessZWK(timeData, samplingRate)
            z = np.arange(1, 241) / 10

            # Small value to avoid divide-by-zero
            sm = np.sqrt(np.finfo(float).eps)  
            
            g = np.ones_like(z)
            g[z > 15.8] = 0.15 * np.exp(0.42 * (z[z > 15.8] - 15.8)) + 0.85
            g[158:208] *= np.linspace(1, 1.035, 50)
            g[209:] *= 1.035
            norm_cst = 0.10687977124128878

            # Sharpness Computation
            # specificSharpness is the specific sharpness density S'(z) [acum/Bark].
            # The DIN 45692 integral S = integral S'(z) dz  ≈  sum(S'[k]) * dz.
            # With dz = 0.1 Bark and 240 bands, dividing by dz converts the
            # per-band contribution into the correct density for plotting.
            dz = z[1] - z[0]  # = 0.1 Bark
            num = norm_cst * (g * z * sL) + sm
            specificSharpness = np.squeeze(num / ((np.sum(sL) + sm) * dz))
        return(Bark, globalSharpness, specificSharpness)
              
        