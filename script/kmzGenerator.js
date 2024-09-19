function convertTimestamp (timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function generateKMZ() {
  const geoJSONFile = document.getElementById("json").files[0];
  const reader = new FileReader();

  reader.onload = async function(event) {
    let geoJSON;
    try {
      geoJSON = JSON.parse(event.target.result);
      if (!geoJSON.features) throw new Error("Invalid GeoJSON file");
    } catch (error) {
      document.getElementById("errorMessage").textContent = "Invalid GeoJSON file. Please upload a valid file.";
      document.getElementById("errorMessage").style.display = "block";
      return;
    }
    
    geoJSON.features.forEach(feature => {
      const properties = feature.properties;
      const { date, google_maps_url, location } = properties;
      let { address, name, Comment: comment } = location || {};

      properties.name = name || address || (feature.geometry && feature.geometry.coordinates.join(", "));

      if (address) properties.address = address;
      
      properties.description = "";
      if (address) properties.description = `<b>Address:</b> ${address}<br>`;
      if (date) properties.description += `<b>Date bookmarked:</b> ${convertTimestamp(date)}<br>`;
      if (comment) properties.description += `<b>Comment:</b> ${comment}<br>`;
      if (google_maps_url) properties.description += `<b>Google Maps URL:</b> <a href="${google_maps_url}">${google_maps_url}</a><br>`;

      delete properties.location;
      delete properties.date;
      delete properties.google_maps_url;
    });

    const kml = tokml(geoJSON);

    const zip = new JSZip();
    zip.file("Google Saved Places.kml", kml);

    const blob = await zip.generateAsync({ type: "blob" });

    const link = document.getElementById("downloadLink");
    link.href = URL.createObjectURL(blob);
    link.download = `Google_Saved_Places.kmz`;
    link.style.display = "block";
    link.textContent = "Download KMZ";
  };

  reader.readAsText(geoJSONFile);
}
