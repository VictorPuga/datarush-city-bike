type IconProps = {
  size?: number;
};

// Material Symbols (Outlined, weight 400), Apache-2.0: https://fonts.google.com/icons
export const PEDAL_BIKE_PATH =
  'M194-160q-81 0-137.5-57T0-355q0-81 57.04-137.5T195-549q71 0 124.5 45.5T384-388h51l-82-232h-73v-60h188v60h-52l26 71h222l-71-191H488v-60h99q24 0 40.5 11t24.5 33l76 207h38q80.51 0 137.26 56.23Q960-436.53 960-356.75 960-276 903.74-218T766-160q-71.6 0-125.8-48T574-328H384q-11 72-64.5 120T194-160Zm0-60q48 0 83.5-31t47.5-77H206v-60h119q-12-45-48-73t-82-28q-56 0-95.5 39T60-355q0 56.25 39 95.62Q138-220 194-220Zm305-168h76q4-23 15.5-51t31.5-50H463l36 101Zm267 168q56 0 95-39.38 39-39.37 39-95.62 0-56-39-95t-95-39h-16l39 113-56 19-43-112q-29 17-43.5 48T632-355q0 56.25 39 95.62Q710-220 766-220ZM193-355Zm573 0Z';
const ELECTRIC_BIKE_PATH =
  'M193-280q-81 0-137.5-57T-1-475q0-81 57.04-137.5T194-669q71 0 124.5 45.5T383-508h51l-82-232h-73v-60h188v60h-52l26 71h222l-71-191H487v-60h99q24 0 40.5 11t24.5 33l76 207h38q80.51 0 137.26 56.23Q959-556.53 959-476.75 959-396 902.74-338T765-280q-71.6 0-125.8-48T573-448H383q-11 72-64.5 120T193-280Zm0-60q48 0 83.5-31t47.5-77H205v-60h119q-12-45-48-73t-82-28q-56 0-95.5 39T59-475q0 56.25 39 95.62Q137-340 193-340Zm305-168h76q4-23 15.5-51t31.5-50H462l36 101Zm267 168q56 0 95-39.38 39-39.37 39-95.62 0-56-39-95t-95-39h-16l39 113-56 19-43-112q-29 17-43.5 48T631-475q0 56.25 39 95.62Q709-340 765-340ZM516-40 293-153h147v-76l227 114H516v75ZM192-475Zm573 0Z';

function Icon({ size = 16, path, label }: IconProps & { path: string; label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-label={label}
      role="img"
    >
      <path d={path} />
    </svg>
  );
}

export function ClassicBikeIcon(props: IconProps) {
  return <Icon {...props} path={PEDAL_BIKE_PATH} label="Classic bike" />;
}

export function ElectricBikeIcon(props: IconProps) {
  return <Icon {...props} path={ELECTRIC_BIKE_PATH} label="Electric bike" />;
}
