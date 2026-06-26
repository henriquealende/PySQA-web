from PySide6 import QtCharts
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtCore import Qt

from Utils.filter_utils import FilterUtils
import numpy as np
from tqdm import tqdm
import os
import math

from Psychoacoustics.loudness import Loudness
from Psychoacoustics.sharpness_din import Sharpnes_DIN
from Psychoacoustics.roughness import Roughness
from Psychoacoustics.mpi import IPM
from Psychoacoustics.tonality import TonalityECMA

loudness = Loudness()
sharpness_din = Sharpnes_DIN()
roughness = Roughness()
mpi = IPM()
tonality = TonalityECMA()

HZ_VALUES = np.array([50, 100, 200, 300, 400, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000])
BARK_CONV_VALUES = np.array([0.51, 1.00, 1.93, 2.79, 3.59, 4.63, 8.04, 12.33, 16.94, 20.73, 22.38, 23.38, 24.06])
BARK_HMS_VALUES = np.array([0.61, 1.22, 2.39, 3.51, 4.56, 5.61, 9.61, 14.50, 19.14, 23.47, 25.75, 27.59, 29.11])

class GraphUtils():
    def __init__(self):
        super(GraphUtils, self).__init__()

    @staticmethod
    def hz_to_barkHMS(hz_val):
        return np.interp(hz_val, HZ_VALUES, BARK_HMS_VALUES)

    @staticmethod
    def hz_to_bark(hz_val):
        return np.interp(hz_val, HZ_VALUES, BARK_CONV_VALUES)


    def getGraph(self, pathExports, domain, samplingBox):
        # 'self' aqui é a instância Expand_Graph
        
        # Limpa o eixo e a lista de dados plotados
        self.mpl_axes.clear()
        self.plotted_data = [] 

        if not isinstance(pathExports, list):
            pathExports = [pathExports]
        
        self.global_values = []
        GraphUtils.defineDomain(self, pathExports, domain, samplingBox)
        
        chartView = GraphUtils.plotGraph(self) 

        if self.global_values:
            display_text = "\n".join(self.global_values)
            self.mpl_axes.text(0.98, 0.98, display_text,
                               transform=self.mpl_axes.transAxes,
                               fontsize=10, color="#333333",
                               ha='right', va='top',
                               bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.7))

        if self.mpl_axes.get_legend_handles_labels()[0]:
             self.mpl_axes.legend(loc='upper left', frameon=True, facecolor='white', framealpha=0.7, fontsize='small')

        self.mpl_canvas.draw()
        
        return chartView 

    def defineDomain(self, pathExports, domain, samplingBox):
        # 'self' é a instância Expand_Graph
        ax = self.mpl_axes 
        
        x_list, y_list = [], []
        colors = ["#50b89e", "#f16637"]
        
        axis_x_title = ""
        axis_y_title = ""

        for timeData, samplingRate, color, pathExport in tqdm(zip(self.timeData, self.samplingRate, colors, pathExports), total=len(self.timeData), desc="Processing data"):
            filename = os.path.basename(pathExport)
            if domain == 'Time':
                y = timeData
                T = len(timeData) / samplingRate
                x = np.linspace(0, T, len(y))
                ax.plot(x, y, label=filename, color=color, linewidth=1.0)
                axis_x_title, axis_y_title = "Time [s]", "Amplitude"
                
            elif domain == 'Frequency':
                rms_val = np.sqrt(np.mean(timeData**2))
                if rms_val > 0:
                    overall_spl = 20 * np.log10(rms_val / 2e-5)
                    # --- MODIFICAÇÃO: Adicionado "(Overall)" ---
                    self.global_values.append(f"{filename} (Overall): {overall_spl:.2f} dB SPL")
                x, y, Yplot = FilterUtils.getFFT(timeData, samplingRate)
                if samplingBox == "1/3 octave":
                    y = FilterUtils.getBandValue(Yplot, samplingRate)
                    x = np.array([50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000])
                    y = 20 * np.log10(y / 2e-5)
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                axis_x_title, axis_y_title = "Frequency [Hz]", "SPL [dB]"

            elif domain == 'IPM':
                x, MPI_values = mpi.calculateMPI(timeData, samplingRate)
                y = MPI_values[0,:] if MPI_values.ndim > 1 else MPI_values
                global_ipm = 10 * np.log10(np.sum(10**(y / 10)))
                # --- MODIFICAÇÃO: Adicionado "(Global)" ---
                self.global_values.append(f"{filename} (Global): {global_ipm:.2f} IPM")
                
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                
                if x.size > 0:
                    ax.axhline(y=5, color="#d35400", linestyle='--', linewidth=2, label="Impulsive Threshold (5 dB)")
                
                axis_x_title, axis_y_title = "Frequency [Bark HMS]", "IPM [dB/Bark HMS]"

            elif domain == 'Loudness ISO 532-1':
                x, globalLoudness, y = loudness.loudnessZWK(timeData, samplingRate)
                # --- MODIFICAÇÃO: Adicionado "(Global)" ---
                self.global_values.append(f"{filename} (Global): {globalLoudness:.2f} sone")
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                axis_x_title, axis_y_title = "Frequency [Bark]", "Loudness [sone/Bark]"

            elif domain == 'Loudness ECMA 418-2':
                x, globalLoudness, y = loudness.loudnessECMA(timeData, samplingRate)
                # --- MODIFICAÇÃO: Adicionado "(Global)" ---
                self.global_values.append(f"{filename} (Global): {globalLoudness:.2f} sone")
                y = np.array(y)
                if y.ndim > 1: y = np.mean(y, axis=1)
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                axis_x_title, axis_y_title = "Frequency [Bark HMS]", "Loudness [sone/Bark HMS]"

            elif domain == 'Sharpness DIN 45692':
                # --- INÍCIO DA MODIFICAÇÃO: Cálculo do Global Sharpness ---
                x, _, y = sharpness_din.sharpnessCalculation(timeData, samplingRate) # Ignora globalSharpness
                y = np.array(y)
                if y.ndim > 1: y = np.mean(y, axis=1)
                
                # Calcula o valor total pela integração (regra do trapézio)
                globalSharpness_calc = np.trapezoid(y, x)
                self.global_values.append(f"{filename} (Global): {globalSharpness_calc:.2f} acum")
                # --- FIM DA MODIFICAÇÃO ---

                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                axis_x_title, axis_y_title = "Frequency [Bark]", "Sharpness [acum/Bark]"

            elif domain == 'Roughness DW':
                x, globalRoughness_calc, y = roughness.roughnessDW(timeData, samplingRate)
                y = np.array(y)
                if y.ndim > 1: y = np.mean(y, axis=1)
                self.global_values.append(f"{filename} (Global): {globalRoughness_calc:.2f} asper")
                
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                axis_x_title, axis_y_title = "Frequency [Bark]", "Roughness [asper/Bark]"

            elif domain == 'Roughness ECMA 418-2':
                x, globalRoughness_calc, y = roughness.roughnessECMA_Shm(timeData, samplingRate)
                y = np.array(y)
                if y.ndim > 1: y = np.mean(y, axis=1)
                self.global_values.append(f"{filename} (Global): {globalRoughness_calc:.2f} asper")
                
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                axis_x_title, axis_y_title = "Frequency [Bark HMS]", "Roughness [asper/Bark HMS]"

            elif domain == 'Tonality ECMA 418-2':
                # --- INÍCIO DA MODIFICAÇÃO: Ajuste de Rótulos ---
                #_, Ts, _, Tsv, _, _, _, _, z = tonality.calculate_tonality(timeData, samplingRate)
                x, globalTonality, y = tonality.tonalityECMA_Shm(timeData, samplingRate)
                # Tsv (Total) é a soma/integral de Ts (Específico)
                self.global_values.append(f"{filename} (Total): {globalTonality:.2f} tu_HMS") 
                ax.plot(x, y, label=filename, color=color, linewidth=1.2)
                # O eixo Y é "Específico", então a unidade é por Bark
                axis_x_title, axis_y_title = "Critical-Band Rate [Bark_HMS]", "Specific Tonality [tu_HMS/Bark]"
                # --- FIM DA MODIFICAÇÃO ---
            
            x_list.append(x)
            y_list.append(y)
            self.plotted_data.append((filename, x, y, axis_x_title, axis_y_title))

        GraphUtils.configureAxes(self, axis_x_title, axis_y_title)
        
        return

    def configureAxes(self, x_title, y_title):
        # 'self' é a instância Expand_Graph
        ax = self.mpl_axes 
        
        if hasattr(self, 'ax_top'):
            self.ax_top.remove()
            del self.ax_top

        domain = self.gp.domainBox.currentText()

        if domain == 'Frequency':
            from matplotlib.ticker import FixedLocator, FixedFormatter
            ax.set_xscale('log')
            ax.set_xlim(left=20)
            _FREQ_MARKS  = [100, 200, 500, 1000, 2000, 2500, 5000, 7500, 10000, 16000, 20000]
            _FREQ_LABELS = ['100', '200', '500', '1k', '2k', '2.5k', '5k', '7.5k', '10k', '16k', '20k']
            ax.xaxis.set_major_locator(FixedLocator(_FREQ_MARKS))
            ax.xaxis.set_major_formatter(FixedFormatter(_FREQ_LABELS))
        else:
            ax.set_xscale('linear')
        
        ax.set_xlabel(x_title, fontsize=11, color="#333")
        ax.set_ylabel(y_title, fontsize=11, color="#333")

        ax.tick_params(axis='x', colors='#333', labelsize=9)
        ax.tick_params(axis='y', colors='#333', labelsize=9)
        
        ax.spines['top'].set_color('#888')
        ax.spines['bottom'].set_color('#888')
        ax.spines['left'].set_color('#888')
        ax.spines['right'].set_color('#888')

        if "Bark" in x_title:
            self.ax_top = ax.twiny() 
            self.ax_top.set_xlabel("Frequency [Hz]", fontsize=11, color="#333")

            hz_labels = [100, 200, 500, 1000, 2000, 2500, 5000, 7500, 10000, 16000, 20000]
            bark_ticks = []
            hz_tick_labels = []

            for hz in hz_labels:
                if "HMS" in x_title:
                    bark_pos = GraphUtils.hz_to_barkHMS(hz) 
                else:
                    bark_pos = GraphUtils.hz_to_bark(hz)
                
                bark_ticks.append(bark_pos)
                label = f"{hz/1000:g}k" if hz >= 1000 else str(hz)
                hz_tick_labels.append(label)

            self.ax_top.set_xticks(bark_ticks)
            self.ax_top.set_xticklabels(hz_tick_labels)
            
            min_bark, max_bark = ax.get_xlim()
            self.ax_top.set_xlim(min_bark, max_bark)
            
            self.ax_top.tick_params(axis='x', colors='#333', labelsize=9)
            self.ax_top.spines['top'].set_color('#888')
        
        self.mpl_figure.tight_layout()

    def plotGraph(self):
        # 'self' é a instância Expand_Graph
        ax = self.mpl_axes
        
        if not self.plotted_data:
             pass
        else:            
            min_x, max_x = np.inf, -np.inf
            min_y, max_y = np.inf, -np.inf

            for _, x, y, _, _ in self.plotted_data:
                min_x = min(min_x, np.min(x))
                max_x = max(max_x, np.max(x))
                min_y = min(min_y, np.min(y))
                max_y = max(max_y, np.max(y))
            
            x_margin = (max_x - min_x) * 0.05 if max_x > min_x else 1
            y_margin = (max_y - min_y) * 0.05 if max_y > min_y else 1
            
            if ax.get_xscale() == 'log':
                ax.set_xlim(left=max(min_x, 20))
                ax.set_ylim(min_y - y_margin, max_y + y_margin)
            else:
                ax.set_xlim(min_x - x_margin, max_x + x_margin)
                ax.set_ylim(min_y - y_margin, max_y + y_margin)
          
        chartView = self.mpl_canvas
        
        self.gp.chartview = chartView 
        
        return chartView