
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import OSM from 'ol/source/OSM'
import TileWMS from 'ol/source/TileWMS'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import WFS from 'ol/format/WFS'
import GML32 from 'ol/format/GML32'

import { fromLonLat, toLonLat } from 'ol/proj'
import { getDistance } from 'ol/sphere'

import {
  Circle as CircleStyle,
  Fill,
  Stroke,
  Style
} from 'ol/style'

import 'ol/ol.css'
import './App.css'

type NearbyMonument = {
  name: string
  localId: string
  protection: string
  distance: number
  coordinates: [number, number]
}

type RouteResponse = {
  trip?: {
    summary?: {
      length?: number
      time?: number
    }
    legs?: Array<{
      shape?: string
      maneuvers?: Array<{
        instruction?: string
      }>
    }>
  }
  error?: string
}

const mapElement = ref<HTMLDivElement | null>(null)
const locationMessage = ref('')
const nearbyMonuments = ref<NearbyMonument[]>([])

const currentLocation = ref<[number, number] | null>(null)

const selectedMonument = ref<{
  name: string
  localId: string
  protection: string
} | null>(null)

const routeDistance = ref('')
const routeDuration = ref('')
const routeInstructions = ref<string[]>([])
const routeMessage = ref('')
const routeLoading = ref(false)

let map: Map | undefined
let locationLayer: VectorLayer<VectorSource> | undefined
let monumentLayer: VectorLayer<VectorSource> | undefined
let routeLayer: VectorLayer<VectorSource> | undefined

// Decode Valhalla's encoded polyline (precision 6)
function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = []

  let index = 0
  let latitude = 0
  let longitude = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    const latitudeChange =
      (result & 1) !== 0 ? ~(result >> 1) : result >> 1

    latitude += latitudeChange

    result = 0
    shift = 0

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    const longitudeChange =
      (result & 1) !== 0 ? ~(result >> 1) : result >> 1

    longitude += longitudeChange

    coordinates.push([
      latitude / 1000000,
      longitude / 1000000
    ])
  }

  return coordinates
}

// Find the user's current location
function findMyLocation(): void {
  if (!navigator.geolocation) {
    locationMessage.value =
      'Geolocation is not supported by your browser.'
    return
  }

  locationMessage.value = 'Finding your location...'

  navigator.geolocation.getCurrentPosition(
    (position: GeolocationPosition) => {
      if (!map) return

      const userLonLat: [number, number] = [
        position.coords.longitude,
        position.coords.latitude
      ]

      currentLocation.value = userLonLat

      const coordinates = fromLonLat(userLonLat)

      const features = monumentLayer?.getSource()?.getFeatures() ?? []

      const monumentsWithDistances: NearbyMonument[] = features
        .flatMap((feature): NearbyMonument[] => {
          const geometry = feature.getGeometry()

          if (!geometry) return []

          const closestPoint = geometry.getClosestPoint(coordinates)
          const monumentLonLat = toLonLat(closestPoint)

          const distance = getDistance(userLonLat, monumentLonLat)

          return [{
            name: String(feature.get('text') ?? 'Unnamed monument'),
            localId: String(feature.get('localId') ?? 'Not available'),
            protection: String(
              feature.get('siteProtectionClassification') ?? 'Not available'
            ),
            distance,
            coordinates: [
              monumentLonLat[0],
              monumentLonLat[1]
            ]
          }]
        })
        .sort((a, b) => a.distance - b.distance)

      const withinRange = monumentsWithDistances.filter(
        (monument) => monument.distance <= 1500
      )

      const nearestThree = monumentsWithDistances.slice(0, 3)

      const result = [...withinRange]

      nearestThree.forEach((monument) => {
        if (!result.some((item) => item.localId === monument.localId)) {
          result.push(monument)
        }
      })

      nearbyMonuments.value = result.sort(
        (a, b) => a.distance - b.distance
      )

      // Show user's location
      const locationFeature = new Feature({
        geometry: new Point(coordinates)
      })

      locationFeature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 9,
            fill: new Fill({
              color: '#2563eb'
            }),
            stroke: new Stroke({
              color: '#ffffff',
              width: 3
            })
          })
        })
      )

      locationLayer?.getSource()?.clear()
      locationLayer?.getSource()?.addFeature(locationFeature)

      map.getView().animate({
        center: coordinates,
        zoom: 16,
        duration: 1000
      })

      locationMessage.value =
        `Found your location. Found ${nearbyMonuments.value.length} nearby monuments.`
    },
    () => {
      locationMessage.value =
        'Unable to get your location. Please allow location access.'
    },
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  )
}

// Select a monument from the nearby list
function selectNearbyMonument(monument: NearbyMonument): void {
  selectedMonument.value = {
    name: monument.name,
    localId: monument.localId,
    protection: monument.protection
  }

  const coordinates = fromLonLat(monument.coordinates)

  map?.getView().animate({
    center: coordinates,
    zoom: 17,
    duration: 1000
  })
}

// Calculate and display a walking route
async function showWalkingRoute(
  monument: NearbyMonument
): Promise<void> {
  if (!currentLocation.value) {
    routeMessage.value = 'Please find your location first.'
    return
  }

  routeLoading.value = true
  routeMessage.value = 'Calculating walking route...'

  routeDistance.value = ''
  routeDuration.value = ''
  routeInstructions.value = []

  routeLayer?.getSource()?.clear()

  try {
    const origin = currentLocation.value

    const response = await fetch(
      'https://valhalla1.openstreetmap.de/route',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locations: [
            {
              lat: origin[1],
              lon: origin[0]
            },
            {
              lat: monument.coordinates[1],
              lon: monument.coordinates[0]
            }
          ],
          costing: 'pedestrian',
          units: 'kilometers',
          language: 'en'
        })
      }
    )

    if (!response.ok) {
      throw new Error(`Routing service error: ${response.status}`)
    }

    const data = await response.json() as RouteResponse

    if (!data.trip?.legs?.length) {
      throw new Error(data.error ?? 'No walking route was found.')
    }

    const leg = data.trip.legs[0]

    if (!leg.shape) {
      throw new Error('The routing service returned no route geometry.')
    }

    // Decode route coordinates and transform them for OpenLayers
    const decodedCoordinates = decodePolyline(leg.shape)

    const routeCoordinates = decodedCoordinates.map(
      ([latitude, longitude]) =>
        fromLonLat([longitude, latitude])
    )

    const routeFeature = new Feature({
      geometry: new LineString(routeCoordinates)
    })

    routeFeature.setStyle(
      new Style({
        stroke: new Stroke({
          color: '#2563eb',
          width: 6
        })
      })
    )

    routeLayer?.getSource()?.clear()
    routeLayer?.getSource()?.addFeature(routeFeature)

    // Show the complete route
    const routeExtent = routeFeature.getGeometry()?.getExtent()

    if (routeExtent && map) {
      map.getView().fit(routeExtent, {
        padding: [70, 70, 70, 70],
        duration: 1000,
        maxZoom: 18
      })
    }

    // Distance and estimated walking time
    const summary = data.trip.summary

    if (summary) {
      routeDistance.value =
        `${summary.length?.toFixed(2) ?? 'Unknown'} km`

      const minutes = Math.ceil((summary.time ?? 0) / 60)

      routeDuration.value = `${minutes} minutes`
    }

    // Turn-by-turn instructions
    routeInstructions.value = (leg.maneuvers ?? [])
      .map((maneuver) => maneuver.instruction ?? '')
      .filter((instruction) => instruction.length > 0)

    selectedMonument.value = {
      name: monument.name,
      localId: monument.localId,
      protection: monument.protection
    }

    routeMessage.value = 'Walking route calculated successfully.'
  } catch (error) {
    console.error('Error calculating walking route:', error)

    routeMessage.value =
      'Could not calculate the walking route. Please try again.'
  } finally {
    routeLoading.value = false
  }
}

// Load monument data from WFS
async function loadMonuments(): Promise<void> {
  try {
    locationMessage.value = 'Loading monument data...'

    const url =
      '/wfs?service=WFS&version=2.0.0&request=GetFeature' +
      '&typeNames=app:Baudenkmal_SH' +
      '&srsName=EPSG:4258'

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`WFS request failed: ${response.status}`)
    }

    const xml = await response.text()

    const wfsFormat = new WFS({
      version: '2.0.0',
      featureNS: 'http://www.deegree.org/app',
      featureType: 'Baudenkmal_SH',
      gmlFormat: new GML32({
        srsName: 'urn:ogc:def:crs:EPSG::4258'
      })
    })

    const features = wfsFormat.readFeatures(xml, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    })

    monumentLayer?.getSource()?.clear()
    monumentLayer?.getSource()?.addFeatures(features)

    const extent = monumentLayer?.getSource()?.getExtent()

    if (extent && map) {
      map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        maxZoom: 16
      })
    }

    locationMessage.value =
      `Loaded ${features.length} monument features.`
  } catch (error) {
    console.error('Error loading monuments:', error)

    locationMessage.value =
      'Could not load monument data. Please try again.'
  }
}

// Handle clicks on monument features
function selectMonumentAtPixel(pixel: number[]): void {
  if (!map || !monumentLayer) return

  const feature = map.forEachFeatureAtPixel(
    pixel,
    (foundFeature) => foundFeature,
    {
      layerFilter: (layer) => layer === monumentLayer,
      hitTolerance: 8
    }
  )

  if (!feature) {
    selectedMonument.value = null
    return
  }

  selectedMonument.value = {
    name: String(
      feature.get('text') ??
      feature.get('name') ??
      'Unnamed monument'
    ),
    localId: String(feature.get('localId') ?? 'Not available'),
    protection: String(
      feature.get('siteProtectionClassification') ??
      'Not available'
    )
  }
}


function resetNavigation(): void {
  // Remove the current route from the map
  routeLayer?.getSource()?.clear()

  // Clear selected monument and navigation information
  selectedMonument.value = null
  routeDistance.value = ''
  routeDuration.value = ''
  routeInstructions.value = []
  routeMessage.value = ''
  routeLoading.value = false

  // Keep the user's location and nearby list
  // Move the map back to the user's location
  if (currentLocation.value && map) {
    map.getView().animate({
      center: fromLonLat(currentLocation.value),
      zoom: 16,
      duration: 800
    })
  }
}


// Create the map
onMounted(() => {
  if (!mapElement.value) return

  map = new Map({
    target: mapElement.value,
    layers: [
      new TileLayer({
        source: new OSM()
      })
    ],
    view: new View({
      center: fromLonLat([10.1228, 54.3233]),
      zoom: 13
    })
  })

  // User location layer
  locationLayer = new VectorLayer({
    source: new VectorSource()
  })

  map.addLayer(locationLayer)

  // WMS layer
  const wmsLayer = new TileLayer({
    source: new TileWMS({
      url: 'https://service.gdi-sh.de/SH_INSPIREVIEW_AI_PS',
      params: {
        LAYERS: 'PS.ProtectedSitesBaudenkmal',
        TILED: true,
        VERSION: '1.3.0'
      },
      serverType: 'geoserver'
    })
  })

  map.addLayer(wmsLayer)

  // Monument layer
  monumentLayer = new VectorLayer({
    source: new VectorSource(),
    style: new Style({
      fill: new Fill({
        color: 'rgba(220, 38, 38, 0.2)'
      }),
      stroke: new Stroke({
        color: '#dc2626',
        width: 2
      })
    })
  })

  map.addLayer(monumentLayer)

  // Walking route layer
  routeLayer = new VectorLayer({
    source: new VectorSource()
  })

  map.addLayer(routeLayer)

  map.on('singleclick', (event) => {
    selectMonumentAtPixel(event.pixel)
  })

  void loadMonuments()
})

// Clean up map when leaving the component
onBeforeUnmount(() => {
  map?.setTarget(undefined)
})
</script>


<template>
  <main class="app">
    <header class="header">
      <div class="header-content">
        <div class="brand">
          <span class="brand-icon">⌖</span>
          <div>
            <h1>MonumentFinder</h1>
            <p>Discover the history around you</p>
          </div>
        </div>

        <button
          class="location-button"
          type="button"
          @click="findMyLocation"
        >
          <span aria-hidden="true">◎</span>
          Find My Location
        </button>
      </div>

      <p
        class="location-message"
        role="status"
        aria-live="polite"
      >
        {{ locationMessage }}
      </p>
    </header>

    <section class="explorer-layout">
      <!-- MAP ON THE LEFT -->
      <section
        class="map-section"
        aria-label="Monument map"
      >
        <div class="map-heading">
          <div>
            <h2>Explore the map</h2>
            <p>Choose a monument to discover more</p>
          </div>
          <span class="map-status">Interactive map</span>
        </div>

        <div
          ref="mapElement"
          class="map"
          role="region"
          aria-label="Interactive monument map"
          tabindex="0"
        ></div>

        <div class="map-legend">
          <span><i class="legend-user"></i> Your location</span>
          <span><i class="legend-monument"></i> Monuments</span>
          <span><i class="legend-route"></i> Walking route</span>
        </div>
      </section>

      <!-- SIDEBAR ON THE RIGHT -->
      <aside class="sidebar">
        <section class="nearby-monuments">
          <div class="section-heading">
            <div>
              <span class="eyebrow">DISCOVER NEARBY</span>
              <h2>Nearby monuments</h2>
            </div>

            <span class="count-badge">
              {{ nearbyMonuments.length }}
            </span>
          </div>

          <p class="section-description">
            All monuments within 1.5 km and at least the three nearest.
          </p>

          <div
            v-if="nearbyMonuments.length > 0"
            class="monument-list"
          >
            <article
              v-for="monument in nearbyMonuments"
              :key="monument.localId"
              class="monument-card"
            >
              <button
                class="monument-name"
                type="button"
                @click="selectNearbyMonument(monument)"
              >
                {{ monument.name }}
              </button>

              <p class="monument-distance">
                <span aria-hidden="true">↗</span>
                {{ (monument.distance / 1000).toFixed(2) }} km from you
              </p>

              <button
                class="route-button"
                type="button"
                :disabled="routeLoading || !currentLocation"
                @click="showWalkingRoute(monument)"
              >
                {{ routeLoading ? 'Calculating...' : 'Start walking route →' }}
              </button>
            </article>
          </div>

          <p v-else class="empty-state">
            Find your location to discover nearby monuments.
          </p>
        </section>

        <!-- NAVIGATION DETAILS -->
        <section class="route-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">YOUR JOURNEY</span>
              <h2>Walking navigation</h2>
            </div>
            <span class="navigation-icon">➤</span>
          </div>

          <p
            v-if="routeMessage"
            class="route-message"
            role="status"
            aria-live="polite"
          >
            {{ routeMessage }}
          </p>

          <div
            v-if="routeDistance || routeDuration"
            class="route-summary"
          >
            <div class="summary-item">
              <span class="summary-label">DISTANCE</span>
              <strong>{{ routeDistance }}</strong>
            </div>

            <div class="summary-item">
              <span class="summary-label">ESTIMATED TIME</span>
              <strong>{{ routeDuration }}</strong>
            </div>
          </div>

          <div v-if="routeInstructions.length > 0">
            <h3 class="instructions-heading">
              Turn-by-turn directions
            </h3>

            <ol class="route-instructions">
              <li
                v-for="(instruction, index) in routeInstructions"
                :key="index"
              >
                <span class="step-number">{{ index + 1 }}</span>
                <span>{{ instruction }}</span>
              </li>
            </ol>
          </div>

          <p
            v-if="!routeMessage && routeInstructions.length === 0"
            class="empty-state"
          >
            Select a monument and start a walking route to see your directions here.
          </p>

          <button
            class="reset-button"
            type="button"
            @click="resetNavigation"
          >
            ↺ Reset navigation
          </button>
        </section>

        <!-- SELECTED MONUMENT DETAILS -->
        <section
          v-if="selectedMonument"
          class="monument-details"
          aria-labelledby="monument-title"
          aria-live="polite"
        >
          <span class="eyebrow">SELECTED MONUMENT</span>

          <h2 id="monument-title">
            {{ selectedMonument.name }}
          </h2>

          <p>
            <strong>Monument ID:</strong>
            {{ selectedMonument.localId }}
          </p>

          <p>
            <strong>Protection:</strong>
            {{ selectedMonument.protection }}
          </p>
        </section>
      </aside>
    </section>
  </main>
</template>
