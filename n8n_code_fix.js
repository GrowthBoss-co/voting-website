// Fixed n8n Code node - returns driveLinks as array

// Get all the Drive links from the aggregated data
const driveLinksArray = [];
for (var i = 0; i < $input.first().json['webViewLink count']; i++) {
  driveLinksArray.push($('Aggregate').first().json.webViewLink[i]);
}

// Get the first file name to extract creator and company
const firstFileName = $('Loop Over Items').first().json.name;

// Parse filename: AssigneeName_CompanyName_file.ext
const parts = firstFileName.split('_');
const creator = parts[0] || '';
const company = parts[1] ? parts[1].replace(/\.[^/.]+$/, '') : ''; // Remove extension

return {
  json: {
    driveLinks: driveLinksArray,  // Return as ARRAY, not string
    creator: creator,
    company: company
  }
};
