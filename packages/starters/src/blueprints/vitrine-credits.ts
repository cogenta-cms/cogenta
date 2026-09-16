/**
 * Where every photograph of the `vitrine` blueprint comes from (L36).
 *
 * Each file under `assets/photos/vitrine/` that is a photograph was taken
 * from Wikimedia Commons under CC0, the public domain or a Creative Commons
 * Attribution licence (never ShareAlike, never NonCommercial), then cropped
 * and resized. Attribution licences ask for the author, the licence and an
 * indication of changes: the seeded "Photo credits" page renders exactly this
 * list, and `scripts/vitrine-assets/README.md` records how the files were made.
 *
 * Client logos and the Vigie interface screenshots are not in this list: they
 * were drawn for this blueprint (HTML and CSS, OFL typefaces) and belong to it.
 */

export interface PhotoCredit {
  readonly file: string
  readonly title: string
  readonly author: string
  readonly licence: string
  /** Absent for the public domain, which has no licence to link to. */
  readonly licenceUrl?: string
  readonly source: string
}

export const VITRINE_PHOTO_CREDITS: readonly PhotoCredit[] = [
  {
    file: 'hero-pylon-dusk.jpg',
    title: 'Kashima Power Line 05',
    author: 'Σ64',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Kashima_Power_Line_05.jpg',
  },
  {
    file: 'solution-sensor-node.jpg',
    title: 'Cellnet UtiliNet, smart utility meter in Minneapolis',
    author: 'Tony Webster',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Cellnet_UtiliNet_-_Smart_Utility_Meter_in_Minneapolis,_Minnesota_(28271290347).jpg',
  },
  {
    file: 'solution-control-room.jpg',
    title: 'Network Rail Signalling System',
    author: 'Tramwayphotos',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Network_Rail_Signalling_System.jpg',
  },
  {
    file: 'solution-clean-room.jpg',
    title: 'Baffled LIGO Scientists',
    author: 'Nkij',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Baffled_LIGO_Scientists.jpg',
  },
  {
    file: 'solution-field-fibre.jpg',
    title: 'Easton Utilities fiber optic cable work demonstration',
    author: 'U.S. Department of Agriculture',
    licence: 'Public domain',
    source:
      'https://commons.wikimedia.org/wiki/File:Easton_Utilities_Fiber_Optic_Cable_Work_Demonstration_(20230920-USDA-RD-CDP-4778).jpg',
  },
  {
    file: 'sector-energy-offshore.jpg',
    title: 'Rhyl Flats offshore wind farm, 2013',
    author: 'jay-jerry',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Rhyl_Flats_offshore_wind_farm_UK_2013.jpg',
  },
  {
    file: 'sector-water-plant.jpg',
    title: 'Machinery in a water treatment plant, Oupeye',
    author: 'Trougnouf (Benoit Brummer)',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Machinery_in_the_water_treatment_plant_of_an_abandoned_steel_factory_in_Oupeye,_Belgium_(DSCF3293).jpg',
  },
  {
    file: 'sector-rail-viaduct.jpg',
    title: 'GVR DBR 1254 and DC 4818 crossing the Makatote Viaduct',
    author: 'Kabelleger',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:GVR_DBR_1254_and_DC_4818_crossing_the_Makatote_Viaduct.jpg',
  },
  {
    file: 'sector-industry-turbines.jpg',
    title: 'Pumpspeicherwerk Glems, Turbinenhalle',
    author: 'Felix König',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Pumpspeicherwerk_Glems_Turbinenhalle_2012.JPG',
  },
  {
    file: 'case-grid-pylons.jpg',
    title: 'Anchor pylon of a 750 kV overhead power line',
    author: 'Novoklimov',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Anchor_pylon_of_high-voltage_overhead_power_line_750_kV.jpg',
  },
  {
    file: 'case-water-pipes.jpg',
    title: 'Pipes in a water treatment plant, Oupeye',
    author: 'Trougnouf (Benoit Brummer)',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Pipes_in_the_water_treatment_plant_of_an_abandoned_steel_factory_in_Oupeye,_Belgium_(DSCF3276).jpg',
  },
  {
    file: 'case-rail-bridge.jpg',
    title: 'Vaalankurkku railway bridge',
    author: 'Teemu Vehkaoja (TeVe)',
    licence: 'CC BY 2.5',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.5/',
    source: 'https://commons.wikimedia.org/wiki/File:Vaalankurkku_railway_bridge.jpg',
  },
  {
    file: 'case-offshore-array.jpg',
    title: 'Gwynt y Môr offshore wind farm, 2013',
    author: 'jay-jerry',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Gwynt_y_M%C3%B4r_offshore_wind_farm_UK_2013_A.jpg',
  },
  {
    file: 'about-instrument.jpg',
    title: 'An engineer inspects NEO Surveyor’s infrared detectors',
    author: 'NASA/JPL-Caltech, Space Dynamics Laboratory',
    licence: 'Public domain',
    source:
      'https://commons.wikimedia.org/wiki/File:An_engineer_inspects_NEO_Surveyor%E2%80%99s_Infrared_Detectors_(PIA26668).jpg',
  },
  {
    file: 'about-servers.jpg',
    title: 'NOIRLab HQ server racks',
    author: 'NOIRLab/NSF/AURA/T. Slovinský',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:NOIRLab_HQ_Server_Racks_(6V6A0404-CC).jpg',
  },
  {
    file: 'careers-studio.jpg',
    title: 'LOOM office seating',
    author: 'Loominade',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://commons.wikimedia.org/wiki/File:LOOM_office_seating.jpg',
  },
  {
    file: 'careers-open-office.jpg',
    title: 'Working in open office space',
    author: 'Crew',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Working_in_open_office_space_(Unsplash).jpg',
  },
  {
    file: 'news-transformer.jpg',
    title: 'High-voltage transformer, 750 kV',
    author: 'Novoklimov',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:High-voltage_transformer_750_kV_%D0%A2%D1%80%D0%B0%D0%BD%D1%81%D1%84%D0%BE%D1%80%D0%BC%D0%B0%D1%82%D0%BE%D1%80_750_%D0%BA%D0%92.jpg',
  },
  {
    file: 'news-hydro-aerial.jpg',
    title: 'Aerial view, Rheinfelden hydroelectric power station',
    author: 'Taxiarchos228',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Aerial_View_-_Wasserkraftwerk_Rheinfelden2.jpg',
  },
  {
    file: 'news-blades.jpg',
    title: 'Wind turbine blades in Mechelen-aan-de-Maas',
    author: 'Trougnouf (Benoit Brummer)',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Wind_turbine_blades_in_Mechelen-aan-de-Maas_(DSCF4409).jpg',
  },
  {
    file: 'news-drive-internals.jpg',
    title: 'Seagate EXOS X18, bottom view',
    author: 'PantheraLeo1359531',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source:
      'https://commons.wikimedia.org/wiki/File:Seagate_EXOS_X18_18_TB_20221006_bottom_view_001.png',
  },
  {
    file: 'contact-loft.jpg',
    title: 'Lone office worker',
    author: 'Jadon Barnes',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Lone_office_worker_(Unsplash).jpg',
  },
]
