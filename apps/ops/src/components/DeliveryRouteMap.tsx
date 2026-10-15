import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { post } from '../lib/api';
import 'leaflet/dist/leaflet.css';

export interface RoutePoint {
  latitude: number | string | null;
  longitude: number | string | null;
}

export interface RouteStopPoint extends RoutePoint {
  label: string;
  order: number;
  priority?: string;
  active?: boolean;
}

type RoadRoute = {
  points: [number, number][];
  distance_km: number;
  duration_minutes: number;
  source: 'OSRM_LOCAL';
};

function coordinates(point: RoutePoint): [number, number] | null {
  if (point.latitude === null || point.longitude === null) return null;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

function FitRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  const boundsKey = JSON.stringify(points);
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [38, 38], maxZoom: 14 });
    else if (points.length === 1) map.setView(points[0], 12);
  }, [map, boundsKey]);
  return null;
}

export function DeliveryRouteMap({ hub, stops, onDuration, originLabel = 'Hub keberangkatan' }: { hub: RoutePoint; stops: RouteStopPoint[]; onDuration?: (minutes: number | null) => void; originLabel?: string }) {
  const hubPoint = coordinates(hub);
  const located = stops.map((stop) => ({ ...stop, point: coordinates(stop) }))
    .filter((stop): stop is RouteStopPoint & { point: [number, number] } => stop.point !== null);
  const points = [...(hubPoint ? [hubPoint] : []), ...located.map((stop) => stop.point)];
  const routeKey = JSON.stringify(points);
  const [road, setRoad] = useState<RoadRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRoad(null);
    setRouteError(false);
    onDuration?.(null);
    if (points.length < 2) return;
    setLoading(true);
    void post<{ data: RoadRoute }>('/api/v1/routing/road-route', {
      points: points.map(([latitude, longitude]) => ({ latitude, longitude })),
    }).then(({ data }) => {
      if (active) { setRoad(data); onDuration?.(data.duration_minutes); }
    }).catch(() => {
      if (active) setRouteError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [routeKey, retry]);
  const bounds = useMemo(() => road?.points || points, [road, routeKey]);
  const center = points[0] || [-6.205, 106.835] as [number, number];

  return <div className="delivery-route-map">
    <MapContainer center={center} zoom={11} scrollWheelZoom={false} className="delivery-route-map-canvas">
      <TileLayer url={import.meta.env.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
      <FitRoute points={bounds}/>
      {road ? <Polyline positions={road.points} pathOptions={{ color: '#dc1680', weight: 5, opacity: 0.9 }}/>: null}
      {hubPoint ? <CircleMarker center={hubPoint} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#292f50', fillOpacity: 1 }}><Tooltip direction="top">{originLabel}</Tooltip></CircleMarker> : null}
      {located.map((stop) => <CircleMarker key={stop.order} center={stop.point} radius={stop.active ? 13 : stop.priority === 'URGENT' ? 11 : 9}
        pathOptions={{ color: '#fff', weight: 3, fillColor: stop.active ? '#292f50' : stop.priority === 'URGENT' ? '#db5b23' : '#e81885', fillOpacity: 1 }}>
        <Tooltip direction="top">#{stop.order} · {stop.label}{stop.active ? ' · tujuan berikutnya' : ''}</Tooltip>
      </CircleMarker>)}
    </MapContainer>
    <p>{road ? `Jalur mengikuti jalan · ${road.distance_km} km · perkiraan ${road.duration_minutes} menit tanpa lalu lintas langsung.`
      : loading ? 'Menghitung jalur jalan…'
      : routeError ? <>Jalur jalan belum tersedia. <button type="button" className="text-link" onClick={() => setRetry((value) => value + 1)}>Coba lagi</button></>
      : 'Koordinat belum cukup untuk menghitung jalur jalan.'}
      {located.length < stops.length ? ` ${stops.length - located.length} tujuan belum memiliki koordinat.` : ''}</p>
  </div>;
}
