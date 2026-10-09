export type StationInfo = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  trips: number;
  electricShare: number;
};

export type StationPrediction = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  classic: number;
  electric: number;
};

export type PredictionsResponse = {
  date: string;
  hour: number;
  stations: StationPrediction[];
};
