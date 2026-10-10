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

export type StationPrediction = BikeCounts & {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type RegionPrediction = BikeCounts & {
  id: string;
  name: string;
  borough: string;
  lat: number;
  lon: number;
  stations: number;
};

export type HourPrediction = BikeCounts & {
  hour: number;
};

export type PredictionsResponse = {
  date: string;
  hour: number;
  stations: StationPrediction[];
};

export type StationDayResponse = {
  date: string;
  station: Pick<StationPrediction, 'id' | 'name' | 'lat' | 'lon'>;
  hours: HourPrediction[];
};

export type Layer = 'both' | 'classic' | 'electric';
