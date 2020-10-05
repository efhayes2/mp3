//adapted from the cerner smart on fhir guide. updated to utalize client.js v2 library and FHIR R4

// helper function to process fhir resource to get the patient name.

// var med_list = document.getElementById('med_list');

const rxnorm  = "http://www.nlm.nih.gov/research/umls/rxnorm";


function getPatientName(pt) {
  if (pt.name) {
    var names = pt.name.map(function(name) {
      return name.given.join(" ") + " " + name.family;
    });
    return names.join(" / ")
  } else {
    return "anonymous";
  }
}


// Taken from http://docs.smarthealthit.org/client-js/request.html

function getMedicationName(medCodings = []) {
  var coding = medCodings.find(c => c.system === rxnorm);
  return coding && coding.display || "Unnamed Medication(TM)";
}

function display(data) {
  const output = document.getElementById("med_list");
  output.innerText = data instanceof Error ?
      String(data) :
      JSON.stringify(data, null, 4);
}


// display the patient name gender and dob in the index page
function displayPatient(pt) {
  document.getElementById('patient_name').innerHTML = getPatientName(pt);
  document.getElementById('gender').innerHTML = pt.gender;
  document.getElementById('dob').innerHTML = pt.birthDate;
}

//function to display list of medications
function displayMedication(meds) {
  med_list.innerHTML += "<li> " + meds + "</li>";
}

//helper function to get quanity and unit from an observation resoruce.
function getQuantityValueAndUnit(ob) {
  if (typeof ob != 'undefined' &&
    typeof ob.valueQuantity != 'undefined' &&
    typeof ob.valueQuantity.value != 'undefined' &&
    typeof ob.valueQuantity.unit != 'undefined') {
    return Number(parseFloat((ob.valueQuantity.value)).toFixed(2)) + ' ' + ob.valueQuantity.unit;
  } else {
    return undefined;
  }
}

// helper function to get both systolic and diastolic bp
function getBloodPressureValue(BPObservations, typeOfPressure) {
  var formattedBPObservations = [];
  BPObservations.forEach(function(observation) {
    var BP = observation.component.find(function(component) {
      return component.code.coding.find(function(coding) {
        return coding.code == typeOfPressure;
      });
    });
    if (BP) {
      observation.valueQuantity = BP.valueQuantity;
      formattedBPObservations.push(observation);
    }
  });

  return getQuantityValueAndUnit(formattedBPObservations[0]);
}

// create a patient object to initalize the patient
function defaultPatient() {
  return {
    height: {
      value: ''
    },
    weight: {
      value: ''
    },
    sys: {
      value: ''
    },
    dia: {
      value: ''
    },
    ldl: {
      value: ''
    },
    hdl: {
      value: ''
    },
    note: 'No Annotation',
  };
}

//helper function to display the annotation on the index page
function displayAnnotation(annotation) {
  note.innerHTML = annotation;
}

//function to display the observation values you will need to update this
function displayObservation(obs) {
  weight.innerHTML = obs.weight;
  height.innerHTML = obs.height;
  sys.innerHTML = obs.sys;
  dia.innerHTML = obs.dia;
  hdl.innerHTML = obs.hdl;
  ldl.innerHTML = obs.ldl;
}

//once fhir client is authorized then the following functions can be executed
FHIR.oauth2.ready().then(function(client) {

  // get patient object and then display its demographics info in the banner
  client.request(`Patient/${client.patient.id}`).then(
    function(patient) {
      displayPatient(patient);
      console.log(patient);
    }
  );

  // get observation resoruce values
  // you will need to update the below to retrive the weight and height values
  var query = new URLSearchParams();

  query.set("patient", client.patient.id);
  query.set("_count", 100);
  query.set("_sort", "-date");
  query.set("code", [
    'http://loinc.org|8462-4',
    'http://loinc.org|8480-6',
    'http://loinc.org|2085-9',
    'http://loinc.org|2089-1',
    'http://loinc.org|55284-4',
    'http://loinc.org|3141-9',
	'http://loinc.org|8302-2',
  ].join(","));

  client.request("Observation?" + query, {
    pageLimit: 0,
    flat: true
  }).then(
    function(ob) {
      // group all of the observation resoruces by type into their own
      var byCodes = client.byCodes(ob, 'code');
      var systolicbp = getBloodPressureValue(byCodes('55284-4'), '8480-6');
      var diastolicbp = getBloodPressureValue(byCodes('55284-4'), '8462-4');
      var hdl = byCodes('2085-9');
      var ldl = byCodes('2089-1');
      var weight = byCodes('3141-9');
      var height = byCodes('8302-2');

      // create patient object
      var p = defaultPatient();

      // set patient value parameters to the data pulled from the observation resoruce
      if (typeof systolicbp != 'undefined') {
        p.sys = systolicbp;
      } else {
        p.sys = 'undefined'
      }

      if (typeof diastolicbp != 'undefined') {
        p.dia = diastolicbp;
      } else {
        p.dia = 'undefined'
      }

      p.hdl = getQuantityValueAndUnit(hdl[0]);
      p.ldl = getQuantityValueAndUnit(ldl[0]);

      // weight.s
      // Body weight need rank 593
      p.weight = getQuantityValueAndUnit(weight[0]);
      p.height = getQuantityValueAndUnit(height[0]);

      displayObservation(p)

    });


    const getPath = client.getPath;
    // Based on http://docs.smarthealthit.org/client-js/request.html
   
      client.request(`/MedicationRequest?patient=` + client.patient.id, {        
      resolveReferences: "medicationReference"
  }).then(medResults => medResults.entry.map(item => getMedicationName(
      getPath(item, "resource.medicationCodeableConcept.coding") ||
      getPath(item, "resource.medicationReference.code.coding")
  ))).then(display, display);




  // update function to take in text input from the app and add the note for the latest weight observation annotation
  // you should include text and the author can be set to anything of your choice. keep in mind that this data will
  // be posted to a public sandbox
  function addWeightAnnotation() {

    // The dateTime data type should be in the format YYYY-MM-DDThh:mm:ss+zz:zz

    // var m = new Date();
    //var dateString = m.getUTCFullYear() +"-"+ (m.getUTCMonth()+1) +"-"+ m.getUTCDate() + "T" + m.getUTCHours() + ":" + m.getUTCMinutes() + ":" + m.getUTCSeconds();    
    const dateString = (new Date()).toISOString();

    var authorString = "R. Buckminster Fuller\n"
    var annotation = authorString + dateString;
    displayAnnotation(annotation);

  }

  //event listner when the add button is clicked to call the function that will add the note to the weight observation
  document.getElementById('add').addEventListener('click', addWeightAnnotation);


}).catch(console.error);



/*
  client.patient.api.fetchAllWithReferences(
      { type: "MedicationOrder" },
      [ "MedicationOrder.medicationReference" ]
  ).then(function(results, refs) {
    if (results.length) {
      med_list.innerHTML = "";
      results.forEach(function(prescription) {
        if (prescription.medicationCodeableConcept) {
          displayMedication(prescription.medicationCodeableConcept.coding);
        } else if (prescription.medicationReference) {
          var med = refs(prescription, prescription.medicationReference);
          displayMedication(med && med.code.coding || []);
        }
      });
    }
    else {
      med_list.innerHTML = "No medications found for the selected patient";
    }
  });
*/


/*
    // patient=smart-1642068
    // client.request(`/MedicationRequest?patient=smart-1642068`, {    
// client.request(`/MedicationRequest?patient=${client.patient.id}`, {
//client.request(`/MedicationRequest?patient=` + client.patient.id, {  
 client.request(`/MedicationRequest?patient=smart-1642068`, {      
  resolveReferences: "medicationReference"
}).then(medResults => medResults.entry.map(item => getMedicationName(
  getPath(item, "resource.medicationCodeableConcept.coding") ||
  getPath(item, "resource.medicationReference.code.coding")
)));

/ Taken from
// https://codesandbox.io/s/fhir-client-browser-examples-35u09?file=/browser/medications/index.html:655-917
function getMedicationName(medCodings) {
  var coding = medCodings.find(function(c){
    return c.system == "http://www.nlm.nih.gov/research/umls/rxnorm";
  });
  return coding && coding.display || "Unnamed Medication(TM)";
}
*/

