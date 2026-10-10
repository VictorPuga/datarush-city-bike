import { describeCode } from '@/lib/weatherCodes';
import type { WeatherResponse } from '@/lib/types';
import styles from './Weather.module.css';

type WeatherProps = {
  data: WeatherResponse | undefined;
  slot: number;
};

export default function Weather({ data, slot }: WeatherProps) {
  if (!data || data.weather === 'default') return null;
  const now = data.hours[Math.floor(slot / 4)];
  const temperatures = data.hours.map((hour) => hour.temperature);
  const rain = data.hours.reduce((sum, hour) => sum + hour.precipitation, 0);
  const { label, icon } = describeCode(now.code);

  return (
    <section className={styles.weather} aria-label="Weather">
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.main}>
        <span className={styles.temperature}>{Math.round(now.temperature)}°C</span>
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.details}>
        <div>
          {Math.round(Math.min(...temperatures))}° to {Math.round(Math.max(...temperatures))}° today
        </div>
        <div>
          {Math.round(now.wind)} km/h wind · {now.humidity}% humidity
        </div>
        <div>
          {now.precipitation} mm now · {rain.toFixed(1)} mm in the day
        </div>
      </div>
    </section>
  );
}
