import { DeliveryStop, OptimizedRoute } from '../src/types';

/**
 * Logistics Delivery Route Optimization Engine
 * Implements Nearest Neighbor + 2-Opt TSP heuristic for dispatching fresh produce orders.
 */

export interface Point {
  lat: number;
  lng: number;
  name?: string;
}

// Muslim Vegetable & Fruit Shop Central Depot (Camp Chowk, Khanewal)
export const WAREHOUSE_HUB = {
  lat: 30.298,
  lng: 71.932,
  name: 'Muslim Vegetable & Fruit Shop (Camp Chowk, Khanewal)',
};

/**
 * Calculate Great-Circle distance using Haversine formula in kilometers
 */
export function calculateDistanceKm(p1: Point, p2: Point): number {
  const R = 6371; // Earth radius in km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * 2-Opt local search improvement heuristic to untangle route crossings
 */
function twoOpt(points: any[], initialOrder: number[]): number[] {
  let route = [...initialOrder];
  let improved = true;
  let iterations = 0;
  const maxIterations = 50;

  const totalDist = (r: number[]) => {
    let d = calculateDistanceKm(WAREHOUSE_HUB, points[r[0]].coordinates);
    for (let i = 0; i < r.length - 1; i++) {
      d += calculateDistanceKm(points[r[i]].coordinates, points[r[i + 1]].coordinates);
    }
    return d;
  };

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    let bestDist = totalDist(route);

    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        // Reverse sub-route between i and k
        const newRoute = [
          ...route.slice(0, i),
          ...route.slice(i, k + 1).reverse(),
          ...route.slice(k + 1),
        ];
        const newDist = totalDist(newRoute);
        if (newDist < bestDist - 0.05) {
          route = newRoute;
          bestDist = newDist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return route;
}

/**
 * Optimizes a set of pending delivery orders into an optimal turn-by-turn dispatch sequence
 */
export function optimizeDeliveryRoute(
  orders: any[],
  riderId = 'rider-1',
  riderName = 'Muhammad Tariq'
): OptimizedRoute {
  if (orders.length === 0) {
    return {
      id: `route-${Date.now()}`,
      rider_id: riderId,
      rider_name: riderName,
      stops: [],
      total_distance_km: 0,
      estimated_duration_minutes: 0,
      total_orders: 0,
      created_at: new Date().toISOString(),
    };
  }

  // Fallback coordinates in Camp Chowk, Khanewal if order has none
  const validOrders = orders.map((ord, idx) => ({
    ...ord,
    coordinates:
      ord.coordinates && ord.coordinates.lat && ord.coordinates.lng
        ? ord.coordinates
        : {
            lat: 30.2985 + ((idx * 0.004) % 0.02),
            lng: 71.9325 + ((idx * 0.005) % 0.025),
          },
  }));

  // Step 1: Nearest Neighbor Heuristic
  const unvisited = [...Array(validOrders.length).keys()];
  const initialSequence: number[] = [];
  let currentPos = WAREHOUSE_HUB;

  while (unvisited.length > 0) {
    let nearestIdx = -1;
    let shortestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const orderIdx = unvisited[i];
      const dist = calculateDistanceKm(currentPos, validOrders[orderIdx].coordinates);
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestIdx = i;
      }
    }

    const chosenOrderIdx = unvisited.splice(nearestIdx, 1)[0];
    initialSequence.push(chosenOrderIdx);
    currentPos = validOrders[chosenOrderIdx].coordinates;
  }

  // Step 2: 2-Opt Optimization
  const optimizedSequence = twoOpt(validOrders, initialSequence);

  // Step 3: Build detailed delivery stops with ETAs and leg distances
  let cumulativeMinutes = 15; // 15 mins for warehouse sorting & loading
  let prevPoint = WAREHOUSE_HUB;
  let totalKm = 0;

  const stops: DeliveryStop[] = optimizedSequence.map((orderIdx, idx) => {
    const order = validOrders[orderIdx];
    const legDistance = calculateDistanceKm(prevPoint, order.coordinates);
    totalKm += legDistance;

    // Average travel speed ~25 km/h in city traffic + 6 mins per doorstep handover
    const travelTimeMinutes = Math.round((legDistance / 25) * 60) + 6;
    cumulativeMinutes += travelTimeMinutes;

    prevPoint = order.coordinates;

    const itemsSummary = (order.items || [])
      .map((it: any) => `${it.product_name} (${it.quantity} ${it.unit})`)
      .slice(0, 3)
      .join(', ');

    return {
      stop_number: idx + 1,
      order_id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      delivery_address: order.delivery_address,
      delivery_area: order.delivery_area,
      coordinates: order.coordinates,
      items_summary: itemsSummary || 'Fresh farm grocery basket',
      total_amount: order.total_amount,
      distance_from_prev_km: legDistance,
      estimated_arrival_minutes: cumulativeMinutes,
    };
  });

  return {
    id: `opt-route-${Date.now()}`,
    rider_id: riderId,
    rider_name: riderName,
    stops,
    total_distance_km: Math.round(totalKm * 10) / 10,
    estimated_duration_minutes: cumulativeMinutes,
    total_orders: stops.length,
    created_at: new Date().toISOString(),
  };
}
