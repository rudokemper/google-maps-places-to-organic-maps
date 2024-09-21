function convertTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function parseCoordinates(string) {
  // determine if a string is likely to be coordinates
  // if it is, return the coordinates as an array, if not return undefined
  let parts = string.split(",")

  // coordinates should have 2 parts
  if (parts.length !== 2) {
    return [false, false];
  }
  // if any of the parts cant parse to a float, then its not coordinates
  if (parts.some((coord) => isNaN(parseFloat(coord.trim())))) {
    return [false, false];
  }

  return parts.map(parseFloat)
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
  
  let [long, lat] = parseCoordinates(q);
  if (long && lat) {
    // this is likely coordinates
    console.log("Coordinates found: ", long, lat);
    feature.geometry.coordinates = [long, lat];
  } else {
    // this is likely a place name or address
    console.log("Place name or address found: ", q);
    // detect if this is likely to be an address
    console.log("stripped place name", q.trim());
    let address = q.trim();
    //set the address and create any intermediate objects
    if (!feature.properties.location) {
      feature.properties.location = {};
    }
    feature.properties.location.address = address
   
  }

  return feature;
}

/**
 * The findLocationInURL function may not be able to find the coordinates in the URL. Sometimes it may only find the address.
 * This function will attempt to look up the coordinates for the address in the location field if the coordinates are still missing (i.e. null island).
 *
 * @param {*} feature the feature to process
 * @param {*} userConsent whether the user has given consent to geocode the address
 * @returns the feature, modified if necessary
 */
async function lookupMissingCoordsWithAddress(feature, userConsent) {

  const properties = feature.properties;
  const { date, google_maps_url, location } = properties;
  let { address, name, Comment: comment } = location || {};

  console.log(feature.geometry.coordinates); 
  
  if (!userConsent) {
    console.log("User has not given consent to geocode address, skipping");
    return feature;
  }

  if (feature.geometry.coordinates[0] !== 0 || feature.geometry.coordinates[1] !== 0) {
    console.log("coordinates are present. skipping address lookup");
    return feature;
  }
  console.log(address)
  if (!address) {
    console.log("No address found, skipping");
    return feature;
  }

  let coords = await addressToCoordinates(address);
  console.log("Coordinates looked up: ", coords);
  feature.geometry.coordinates = coords;
  return feature;
}



async function addressToCoordinates(address) {
  return new Promise((resolve, reject) => {
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${address.replace(" ", "+")}&polygon=1&addressdetails=1`
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.length === 0) {
          reject("No results found");
        } else {
          // TODO: we should also possibly return the name of the place
          const { lat, lon } = data[0];
          resolve([lon, lat]);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });

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

function showErrorToUser(message) {
  console.error(message);
  document.getElementById("errorMessage").textContent = message;
  document.getElementById("errorMessage").style.display = "block";
}

function showProgressToUser(message) {
  document.getElementById("progress").textContent = message;
  document.getElementById("progress").style.display = "block";
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
      showErrorToUser("Invalid GeoJSON file. Please upload a valid file.");
      return;
    }

    let itemsToProcess = geoJSON.features.length;
    let itemsProcessed = 0;

    const userGeoCodeConsent = document.getElementById("addressGeocodeOptIn").checked;

    tasks = geoJSON.features.map(async (feature) => {
        feature = await findLocationInURL(feature);
        feature = await lookupMissingCoordsWithAddress(feature, userGeoCodeConsent);
        feature = await processGeoJSONFeature(feature);
        itemsProcessed++;
        showProgressToUser(
          `Processing ${itemsProcessed} of ${itemsToProcess} places...`
        );
        return feature;
      })
    
    geoJSON.features = await Promise.all(tasks)
      .then( (feature) => {
        document.getElementById("progress").style.display = "none";
        return feature;
      })
      .catch((error) => { 
        showErrorToUser("An error occurred while processing the data: "+ error);
      });

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
