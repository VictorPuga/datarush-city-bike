export type StationInfo = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  trips: number;
  electricShare: number;
};

export type BikeCounts = {
  classic: number;
  classicLow: number;
  classicHigh: number;
  electric: number;
  electricLow: number;
  electricHigh: number;
};

export type WeatherSource = 'open-meteo' | 'default';

export type Metric = 'stock' | 'departures';

export type StationPrediction = BikeCounts & {
  id: string;
  name: string;
  lat: number;
  lon: number;
  departures: BikeCounts;
};

export type RegionPrediction = BikeCounts & {
  id: string;
  name: string;
  borough: string;
  lat: number;
  lon: number;
  stations: number;
};

export type SlotPrediction = BikeCounts & {
  slot: number;
  departures: BikeCounts;
};

export type PredictionsResponse = {
  date: string;
  slot: number;
  weather: WeatherSource;
  stations: StationPrediction[];
};

export type StationDayResponse = {
  date: string;
  weather: WeatherSource;
  station: Pick<StationPrediction, 'id' | 'name' | 'lat' | 'lon'>;
  slots: SlotPrediction[];
};

export type Layer = 'both' | 'classic' | 'electric';

export type CitySlot = {
  classic: number;
  electric: number;
  depClassic: number;
  depElectric: number;
};

export type DayTotals = {
  date: string;
  slots: CitySlot[];
};

export type RegionFlow = {
  id: string;
  classic: number;
  electric: number;
};

export type InsightsResponse = {
  date: string;
  slot: number;
  week: DayTotals[];
  netFlow: RegionFlow[];
};
