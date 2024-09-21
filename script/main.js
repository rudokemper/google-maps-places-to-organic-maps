function convertTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function parseCoordinates(string) {
  // determine if a string is likely to be coordinates
  // if it is, return the coordinates as an array, if not return undefined
  let isCoordinates = true;

  let parts = string.split(",")
  // coordinates should have 2 parts
  if (parts.length !== 2) {
    isCoordinates = false;
  }
  // if any of the parts cant parse to a float, then its not coordinates
  if (parts.some((coord) => isNaN(parseFloat(coord)))) {
    isCoordinates = false;
  }

  if (isCoordinates) {
    return parts.map(parseFloat);
  }
}

/**
 *  Attempt to detect the location from the google maps url of the feature
 * 
 * if the coordinates are detected as null island, try to get the coordinates from the google maps url.
 * if the google maps url contains an address, populate the address field
 * 
 * if coordinates are already present, return the feature as is
 *
 * @param {*} feature the feature to process
 * @returns the feature, moodified if necessary
 */
async function findLocationInURL(feature) {

  //if there isnt a null island, return the feature as is
  if (feature.geometry.coordinates[0] !== 0 || feature.geometry.coordinates[1] !== 0) {
    return feature;
  }

  // create a copy of the feature so we don't modify the original
  feature = JSON.parse(JSON.stringify(feature));

  const properties = feature.properties;
  const { date, google_maps_url, location } = properties;
  let { address, name, Comment: comment } = location || {};


  console.log("Null island found, trying to get coordinates from google maps url: ", google_maps_url);

  // parse the google maps url to get the coordinates
  const url = new URL(google_maps_url);
  const searchParams = new URLSearchParams(url.search);
  const q = searchParams.get("q");

  console.log("q", q);

  if (!q) {
    console.log("No coordinates found in google maps url, skipping");
    // the q param isnt present, it likely contains the cid param instead, which might mean that the location is a business, but effectively menas that the properties.location field and the coordinates are already present in the data
    return feature;
  }
  
  const coordinates = parseCoordinates(q);
  if (coordinates) {
    // this is likely coordinates
    let long, lat = coordinates;
    console.log("Coordinates found: ", long, lat);
    feature.geometry.coordinates = [long, lat];
  } 

  return feature;
}

function processGeoJSONFeature(feature) {

  const properties = feature.properties;
  const { date, google_maps_url, location } = properties;
  let { address, name, Comment: comment } = location || {};


  // If name is not available, use address or coordinates
  properties.name =
    name ||
    address ||
    (feature.geometry && feature.geometry.coordinates.join(", "));

  if (address) properties.address = address;

  // Add additional Google Maps data to the description
  properties.description = "";
  if (address) properties.description = `<b>Address:</b> ${address}<br>`;
  if (date)
    properties.description += `<b>Date bookmarked:</b> ${convertTimestamp(
      date
    )}<br>`;
  if (comment) properties.description += `<b>Comment:</b> ${comment}<br>`;
  if (google_maps_url)
    properties.description += `<b>Google Maps URL:</b> <a href="${google_maps_url}">${google_maps_url}</a><br>`;

  delete properties.location;
  delete properties.date;
  delete properties.google_maps_url;
  return feature;
}

function generateFiles() {
  const geoJSONFile = document.getElementById("json").files[0];
  const reader = new FileReader();

  reader.onload = async function (event) {
    let geoJSON;
    try {
      geoJSON = JSON.parse(event.target.result);
      if (!geoJSON.features) throw new Error("Invalid GeoJSON file");
    } catch (error) {
      document.getElementById("errorMessage").textContent =
        "Invalid GeoJSON file. Please upload a valid file.";
      document.getElementById("errorMessage").style.display = "block";
      return;
    }

    geoJSON.features = await Promise.all(
      geoJSON.features.map(async (feature) => {
        feature = await processGeoJSONFeature(feature);
        return feature;
      })
    );

    const gpx = togpx(geoJSON);
    const kml = tokml(geoJSON);

    const zip = new JSZip();
    zip.file("Google Saved Places.kml", kml);

    const gpxBlob = new Blob([gpx], { type: "application/gpx+xml" });
    const kmzBlob = await zip.generateAsync({ type: "blob" });

    const gpxLink = document.getElementById("downloadGpxLink");
    gpxLink.href = URL.createObjectURL(gpxBlob);
    gpxLink.download = `Google Saved Places.gpx`;
    gpxLink.style.display = "block";
    gpxLink.textContent = "Download GPX";

    const kmzLink = document.getElementById("downloadKmzLink");
    kmzLink.href = URL.createObjectURL(kmzBlob);
    kmzLink.download = `Google Saved Places.kmz`;
    kmzLink.style.display = "block";
    kmzLink.textContent = "Download KMZ";
  };

  reader.readAsText(geoJSONFile);
}
