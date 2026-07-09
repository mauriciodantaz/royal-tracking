declare module "react-simple-maps" {
  import type { ComponentType, CSSProperties, ReactNode } from "react";

  export const ComposableMap: ComponentType<{
    projectionConfig?: { scale?: number };
    className?: string;
    children?: ReactNode;
  }>;

  export const Geographies: ComponentType<{
    geography: string;
    children: (data: { geographies: Array<{ rsmKey: string }> }) => ReactNode;
  }>;

  export const Geography: ComponentType<{
    geography: unknown;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
  }>;

  export const Marker: ComponentType<{
    coordinates: [number, number];
    children?: ReactNode;
  }>;
}
