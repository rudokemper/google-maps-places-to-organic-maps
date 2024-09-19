function convertTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function processGeoJSONFeatures(geoJSON) {
  geoJSON.features.forEach((feature) => {
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
  });
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

    processGeoJSONFeatures(geoJSON);

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
