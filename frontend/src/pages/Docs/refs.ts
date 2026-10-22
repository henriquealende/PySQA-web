/**
 * Bibliographic references of the documentation, in the ABNT style (NBR 6023:2018 for the list, NBR 10520:2023
 * for the citations in the text, author-date system).
 *
 * `cite` is what appears in the text: "(FASTL; ZWICKER, 2007)".
 * `entry` is the full reference. Text between double asterisks is the highlighted (bold) title.
 * `sort` orders the list alphabetically, as the standard asks.
 * Online items carry the date they were checked ("Acesso em").
 */
export interface Ref {
  id: string
  cite: string
  sort: string
  entry: string
  url?: string
}

const ACCESS = 'Acesso em: 22 out. 2026.'

export const REFS: Record<string, Ref> = {
  allen1977: {
    id: 'allen1977', cite: 'ALLEN; RABINER, 1977', sort: 'ALLEN',
    entry: 'ALLEN, J. B.; RABINER, L. R. A unified approach to short-time Fourier analysis and synthesis. **Proceedings of the IEEE**, [s. l.], v. 65, n. 11, p. 1558-1564, nov. 1977.',
  },
  bismarck1974: {
    id: 'bismarck1974', cite: 'BISMARCK, 1974', sort: 'BISMARCK',
    entry: 'BISMARCK, G. von. Sharpness as an attribute of the timbre of steady sounds. **Acustica**, Stuttgart, v. 30, n. 3, p. 159-172, 1974.',
  },
  butterworth1930: {
    id: 'butterworth1930', cite: 'BUTTERWORTH, 1930', sort: 'BUTTERWORTH',
    entry: 'BUTTERWORTH, S. On the theory of filter amplifiers. **Experimental Wireless and the Wireless Engineer**, London, v. 7, p. 536-541, 1930.',
  },
  daniel1997: {
    id: 'daniel1997', cite: 'DANIEL; WEBER, 1997', sort: 'DANIEL',
    entry: 'DANIEL, P.; WEBER, R. Psychoacoustical roughness: implementation of an optimized model. **Acustica**, Stuttgart, v. 83, n. 1, p. 113-123, 1997.',
  },
  din45692: {
    id: 'din45692', cite: 'DIN, 2009', sort: 'DEUTSCHES',
    entry: 'DEUTSCHES INSTITUT FÜR NORMUNG. **DIN 45692:2009-08**: Messtechnische Simulation der Hörempfindung Schärfe (measurement technique for the simulation of the auditory sensation of sharpness). Berlin: DIN, 2009. DOI: 10.31030/1521326.',
  },
  ecma418: {
    id: 'ecma418', cite: 'ECMA INTERNATIONAL, 2025', sort: 'ECMA',
    entry: 'ECMA INTERNATIONAL. **ECMA-418-2**: psychoacoustic metrics for ITT equipment – Part 2: methods for describing human perception based on the Sottek Hearing Model. 4. ed. Geneva: Ecma International, 2025. Disponível em: https://ecma-international.org/wp-content/uploads/ECMA-418-2_4th_edition_june_2025.pdf. ' + ACCESS,
    url: 'https://ecma-international.org/wp-content/uploads/ECMA-418-2_4th_edition_june_2025.pdf',
  },
  eomys: {
    id: 'eomys', cite: 'EOMYS ENGINEERING, 2024', sort: 'EOMYS',
    entry: 'EOMYS ENGINEERING. **MoSQITo**: modular sound quality integrated toolbox. [S. l.]: GitHub, 2024. Disponível em: https://github.com/Eomys/MoSQITo. ' + ACCESS,
    url: 'https://github.com/Eomys/MoSQITo',
  },
  fastl2007: {
    id: 'fastl2007', cite: 'FASTL; ZWICKER, 2007', sort: 'FASTL',
    entry: 'FASTL, H.; ZWICKER, E. **Psychoacoustics**: facts and models. 3. ed. Berlin: Springer, 2007. (Springer Series in Information Sciences, v. 22). DOI: 10.1007/978-3-540-68888-4.',
  },
  gustafsson1996: {
    id: 'gustafsson1996', cite: 'GUSTAFSSON, 1996', sort: 'GUSTAFSSON',
    entry: 'GUSTAFSSON, F. Determining the initial states in forward-backward filtering. **IEEE Transactions on Signal Processing**, [s. l.], v. 44, n. 4, p. 988-992, abr. 1996.',
  },
  harris1978: {
    id: 'harris1978', cite: 'HARRIS, 1978', sort: 'HARRIS F',
    entry: 'HARRIS, F. J. On the use of windows for harmonic analysis with the discrete Fourier transform. **Proceedings of the IEEE**, [s. l.], v. 66, n. 1, p. 51-83, jan. 1978.',
  },
  harris2020: {
    id: 'harris2020', cite: 'HARRIS et al., 2020', sort: 'HARRIS C',
    entry: 'HARRIS, C. R. *et al.* Array programming with NumPy. **Nature**, London, v. 585, n. 7825, p. 357-362, 2020. DOI: 10.1038/s41586-020-2649-2.',
  },
  iec60942: {
    id: 'iec60942', cite: 'IEC, 2017', sort: 'INTERNATIONAL ELECTROTECHNICAL 2017',
    entry: 'INTERNATIONAL ELECTROTECHNICAL COMMISSION. **IEC 60942:2017**: electroacoustics – sound calibrators. 4. ed. Geneva: IEC, 2017.',
  },
  iec61260: {
    id: 'iec61260', cite: 'IEC, 2014', sort: 'INTERNATIONAL ELECTROTECHNICAL 2014',
    entry: 'INTERNATIONAL ELECTROTECHNICAL COMMISSION. **IEC 61260-1:2014**: electroacoustics – octave-band and fractional-octave-band filters – Part 1: specifications. Geneva: IEC, 2014.',
  },
  iec61672: {
    id: 'iec61672', cite: 'IEC, 2013', sort: 'INTERNATIONAL ELECTROTECHNICAL 2013',
    entry: 'INTERNATIONAL ELECTROTECHNICAL COMMISSION. **IEC 61672-1:2013**: electroacoustics – sound level meters – Part 1: specifications. 2. ed. Geneva: IEC, 2013.',
  },
  iso1683: {
    id: 'iso1683', cite: 'ISO, 2015', sort: 'INTERNATIONAL ORGANIZATION 2015',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 1683:2015**: acoustics – preferred reference values for acoustical and vibratory levels. Geneva: ISO, 2015.',
  },
  iso266: {
    id: 'iso266', cite: 'ISO, 1997', sort: 'INTERNATIONAL ORGANIZATION 1997',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 266:1997**: acoustics – preferred frequencies. Geneva: ISO, 1997.',
  },
  iso532: {
    id: 'iso532', cite: 'ISO, 2017', sort: 'INTERNATIONAL ORGANIZATION 2017',
    entry: 'INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO 532-1:2017**: acoustics – methods for calculating loudness – Part 1: Zwicker method. Geneva: ISO, 2017.',
  },
  lotinga: {
    id: 'lotinga', cite: 'LOTINGA, 2025', sort: 'LOTINGA',
    entry: 'LOTINGA, M. J. B. **sottek-hearing-model**: Python implementation of the Sottek Hearing Model (ECMA-418-2). Versão 0.1.13. Salford: University of Salford, 2025. Disponível em: https://github.com/mlotinga/sottek-hearing-model. ' + ACCESS,
    url: 'https://github.com/mlotinga/sottek-hearing-model',
  },
  marple1999: {
    id: 'marple1999', cite: 'MARPLE, 1999', sort: 'MARPLE',
    entry: 'MARPLE, S. L. Computing the discrete-time analytic signal via FFT. **IEEE Transactions on Signal Processing**, [s. l.], v. 47, n. 9, p. 2600-2603, set. 1999.',
  },
  mosqito: {
    id: 'mosqito', cite: 'GREEN FORGE COOP, 2024', sort: 'GREEN',
    entry: 'GREEN FORGE COOP. **MOSQITO**: modular sound quality integrated toolbox. Versão 1.2.1. [S. l.]: Zenodo, 2024. DOI: 10.5281/zenodo.10629475.',
  },
  nordtest: {
    id: 'nordtest', cite: 'NORDTEST, 2002', sort: 'NORDTEST',
    entry: 'NORDTEST. **NT ACOU 112**: acoustics: prominence of impulsive sounds and for adjustment of LAeq. Espoo: Nordtest, 2002. Disponível em: https://www.nordtest.info/wp/2002/05/01/acoustics-prominence-of-impulsive-sounds-and-for-adjustment-of-laeq-nt-acou-112/. ' + ACCESS,
    url: 'https://www.nordtest.info/wp/2002/05/01/acoustics-prominence-of-impulsive-sounds-and-for-adjustment-of-laeq-nt-acou-112/',
  },
  oppenheim2010: {
    id: 'oppenheim2010', cite: 'OPPENHEIM; SCHAFER, 2010', sort: 'OPPENHEIM',
    entry: 'OPPENHEIM, A. V.; SCHAFER, R. W. **Discrete-time signal processing**. 3. ed. Upper Saddle River: Pearson, 2010.',
  },
  sanmillan2021: {
    id: 'sanmillan2021', cite: 'SAN MILLÁN-CASTILLO et al., 2021', sort: 'SAN MILLAN',
    entry: 'SAN MILLÁN-CASTILLO, R. *et al.* MOSQITO: an open-source and free toolbox for sound quality metrics in the industry and education. *In*: INTER-NOISE AND NOISE-CON CONGRESS AND CONFERENCE, 2021. **Proceedings** […]. [S. l.]: Institute of Noise Control Engineering, 2021.',
  },
  silveira2024tese: {
    id: 'silveira2024tese', cite: 'SILVEIRA, 2024', sort: 'SILVEIRA 2023',
    entry: 'SILVEIRA, H. A. da. **Qualidade sonora aplicada na análise de sinais impulsivos de refrigeradores**. 2024. 258 f. Tese (Doutorado em Engenharia Mecânica) – Centro Tecnológico, Programa de Pós-Graduação em Engenharia Mecânica, Universidade Federal de Santa Catarina, Florianópolis, 2024.',
  },
  silveira2024: {
    id: 'silveira2024', cite: 'SILVEIRA et al., 2024', sort: 'SILVEIRA 2024 B',
    entry: 'SILVEIRA, H. A. da *et al.* Psychoacoustic model for detecting the sensation of impulsivity in acoustic signals from refrigerators. **Applied Acoustics**, [s. l.], v. 225, art. 110198, 2024.',
  },
  silveira2026: {
    id: 'silveira2026', cite: 'SILVEIRA et al., 2026', sort: 'SILVEIRA 2026',
    entry: 'SILVEIRA, H. A. da *et al.* Discomfort prediction model for impulsive noise in household refrigerator. **Applied Acoustics**, [s. l.], v. 242, art. 111068, 2026.',
  },
  sottek2016: {
    id: 'sottek2016', cite: 'SOTTEK, 2016', sort: 'SOTTEK',
    entry: 'SOTTEK, R. A hearing model approach to time-varying loudness. **Acta Acustica united with Acustica**, [s. l.], v. 102, n. 4, p. 725-744, 2016. DOI: 10.3813/AAA.918989.',
  },
  traunmuller1990: {
    id: 'traunmuller1990', cite: 'TRAUNMÜLLER, 1990', sort: 'TRAUNMULLER',
    entry: 'TRAUNMÜLLER, H. Analytical expressions for the tonotopic sensory scale. **The Journal of the Acoustical Society of America**, [s. l.], v. 88, n. 1, p. 97-100, 1990.',
  },
  shannon1949: {
    id: 'shannon1949', cite: 'SHANNON, 1949', sort: 'SHANNON',
    entry: 'SHANNON, C. E. Communication in the presence of noise. **Proceedings of the IRE**, [s. l.], v. 37, n. 1, p. 10-21, jan. 1949.',
  },
  bendat2010: {
    id: 'bendat2010', cite: 'BENDAT; PIERSOL, 2010', sort: 'BENDAT',
    entry: 'BENDAT, J. S.; PIERSOL, A. G. **Random data**: analysis and measurement procedures. 4. ed. Hoboken: Wiley, 2010.',
  },
  w3cwebaudio: {
    id: 'w3cwebaudio', cite: 'W3C, 2021', sort: 'WORLD WIDE WEB 2021 A',
    entry: 'WORLD WIDE WEB CONSORTIUM. **Web Audio API**. W3C Recommendation. [S. l.]: W3C, 2021. Disponível em: https://www.w3.org/TR/webaudio/. ' + ACCESS,
    url: 'https://www.w3.org/TR/webaudio/',
  },
  w3cmedia: {
    id: 'w3cmedia', cite: 'W3C, [s. d.]', sort: 'WORLD WIDE WEB 2021 B',
    entry: 'WORLD WIDE WEB CONSORTIUM. **Media Capture and Streams**. [S. l.]: W3C, [s. d.]. Disponível em: https://www.w3.org/TR/mediacapture-streams/. ' + ACCESS,
    url: 'https://www.w3.org/TR/mediacapture-streams/',
  },
  virtanen2020: {
    id: 'virtanen2020', cite: 'VIRTANEN et al., 2020', sort: 'VIRTANEN',
    entry: 'VIRTANEN, P. *et al.* SciPy 1.0: fundamental algorithms for scientific computing in Python. **Nature Methods**, [s. l.], v. 17, p. 261-272, 2020. DOI: 10.1038/s41592-019-0686-2.',
  },
  zwicker1961: {
    id: 'zwicker1961', cite: 'ZWICKER, 1961', sort: 'ZWICKER 1961',
    entry: 'ZWICKER, E. Subdivision of the audible frequency range into critical bands (Frequenzgruppen). **The Journal of the Acoustical Society of America**, [s. l.], v. 33, n. 2, p. 248, 1961.',
  },
  zwicker1980: {
    id: 'zwicker1980', cite: 'ZWICKER; TERHARDT, 1980', sort: 'ZWICKER 1980',
    entry: 'ZWICKER, E.; TERHARDT, E. Analytical expressions for critical-band rate and critical bandwidth as a function of frequency. **The Journal of the Acoustical Society of America**, [s. l.], v. 68, n. 5, p. 1523-1525, 1980.',
  },
}

export const sortRefs = (ids: string[]): Ref[] =>
  [...new Set(ids)].map((id) => REFS[id]).filter(Boolean).sort((a, b) => a.sort.localeCompare(b.sort, 'pt'))
