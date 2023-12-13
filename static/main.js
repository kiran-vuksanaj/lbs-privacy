// const { geolib } = require("./geolib")

// map generation code
let map
let service
let infowindow

let start = Date.now()
let dummy = false
let mostRecentLoc = NaN
let mostRecentRad = NaN
let mostRecentType = NaN

// -33.8665433,151.1956316

let cache = {
	'restaurants': new Set(),
	'gas stations': new Set(),
	'hotels': new Set(),
	'cafes': new Set(),
}

function callNewMap(data) {

    start = Date.now();
    
    lat = data.lat.value
    long = data.long.value
    type = data.type.value
	dummy = data.dummy.checked
	caching = data.caching.checked

    var loc = new google.maps.LatLng(lat, long);
	var rad = '500'

	// map still centers on original
	map = new google.maps.Map(document.getElementById('map'), {
        center: loc,
        zoom: 15
        });

	// see if there are any that match up
	if (caching) {
		personalCache = checkCache(loc, rad, type)
	} else {
		personalCache = []
	}

	// if nothing cached, make dummy location and rad
	if (dummy) {
		dummyLoc = dummyLocation({'latitude': lat, 'longitude': long}, rad)
		loc = new google.maps.LatLng(dummyLoc.point.latitude,dummyLoc.point.longitude)
		rad = dummyLoc.radius
	}
	// in the case of dummy
	mostRecentLoc = {'latitude': parseFloat(lat), 'longitude': parseFloat(long)}
	mostRecentRad = parseInt('500')
	mostRecentType = type

    var request = {
            location: loc,
            radius: rad,
            type: [type]
        };


	if (personalCache.length > 0) {
		callback(personalCache, google.maps.places.PlacesServiceStatus.OK)

		console.log("used cached info")
	} else {
		service = new google.maps.places.PlacesService(map);
		service.nearbySearch(request, callback);
		console.log("did not use cached info")
	}

    console.log("mapped!")
}

function initMap() {
    console.log('hi')
}


function checkCache(location, radius, type) {
	points = cache[type]

	console.log(points)

	out = []
	for (const place of points) {
		placeLoc = {'latitude': place.geometry.location.lat(),'longitude': place.geometry.location.lng()}
		if (!isMarkerOutsideCircle(placeLoc, location, radius)) {
			out.push(place)
		}
	}
	console.log(out)
	return out

}
    
function callback(results, status) {

    if (status == google.maps.places.PlacesServiceStatus.OK) {
        for (var i = 0; i < results.length; i++) {
        createMarker(results[i]);
        }
    }
    const end = Date.now();
    console.log(`Execution time: ${end - start} ms`);

}

function createMarker(place) {
    if (!place.geometry || !place.geometry.location) return;

	if (true) {
		if (isMarkerOutsideCircle(
			{'latitude': place.geometry.location.lat(), 'longitude': place.geometry.location.lng()}, 
			mostRecentLoc,
			mostRecentRad)) {
			console.log("passed")
			return
		}
	}

    const marker = new google.maps.Marker({
        map,
        position: place.geometry.location,
    });

	cache[mostRecentType].add(place)

    google.maps.event.addListener(marker, "click", () => {
        infowindow.setContent(place.name || "");
        infowindow.open(map);
    });

 }

function isMarkerOutsideCircle(point1, point2, r) 
  {
	console.log(geolib.getDistance(point1, point2))
	return geolib.getDistance(point1, point2) > 2*r
  }

// end map gen code


// **** Dummy Location Generation ****
const RADIUS_INCR_RATIO = 1.4;

function dummyLocation(point,radius){
    // point: {'lat':n,'lng':n}
    const bearing = Math.random()*360;
    // const distance = (RADIUS_INCR_RATIO-1)*radius;
	const distance = Math.random()*(RADIUS_INCR_RATIO-1)*radius;
    const new_point = geolib.computeDestinationPoint(point,distance,bearing);
    const new_radius = radius*RADIUS_INCR_RATIO;
    return {'point':new_point,'radius':new_radius}; 
}

// **** end dummy location gen ****

// **** PeerJS CONNECTIONS ****

var peer = new Peer();
var PEER_ID = -1;
const TIMEOUT_MS = 5000;

peer.on('open', function(id) {
    console.log('My peer ID is: '+id);
    PEER_ID = id;
    console.log('(using the default peerJS PeerServer to broker connections.');
    console.log('post peer id to GA server; ');
    $.post('/api/post_peer_id',{'pid':id}, function(data,status){
	console.log('status: '+status);
    });
    
});

peer.on('connection',function(conn) {
    // received request from peer, either 1. query local cache or 2. query google
    conn.on('open',function() {
	conn.on('data',function(data) {
	    // console.log(data)
	    // here, there should be distinction made about mode of query! request from google? or check cache?
	    conn.send( {
		'type':'response',
		'success':false,
		'data':'none'
	    });
	});
    });
});


function doRequest(request,pid) {
    return new Promise((resolve,reject) => {
	console.log('attempting connect');
	const conn = peer.connect(pid);
	console.log(conn);
	console.log(request);
	conn.on('open',function() {
	    conn.send(request);
	    conn.on('data', function(data) {
		// received response from peer, either with query data or a message indicating it not found
		console.log('received response');
		// console.log(data);
		resolve(data);
	    });
	});
    });
}

async function queryPeers(request) {
    // sample request! make sure to include 'type':'request', otherwise use the data as expected by other modules
    // const request = {
    // 	'type':'request',
    // 	'latlng':(4,4),
    // 	'radius':30,
    // 	'query':'restaurants'
    // };
	    
    $.get('/api/get_group', function(data) {
	const peer_ids = data['peer_ids'];
	if (PEER_ID in peer_ids) {
	    // remove self from group list
	    peer_ids.splice( peer_ids.indexOf(PEER_ID), 1 );
	}
	const request_local = {...request,
			       'mode':'local'};
	console.log(peer_ids);

	const timeoutPromise = new Promise((resolve,reject) => {
	    // timeout promise
	    setTimeout(resolve,TIMEOUT_MS,[{'success':false}]);
	});

	
	const local_cache_promises = [];
	for(let i=0; i<peer_ids.length; i++) {
	    // for each peer, connect and request a local query
	    local_cache_promises.push( doRequest(request_local,peer_ids[i]) );
	    
	}
	console.log(local_cache_promises);
	Promise.any([timeoutPromise,Promise.any(local_cache_promises)]).then((data)=>{
	    console.log('all complete');
	    console.log(data);

	    // if query not matched, continue to request from google
	    let dataFound = false;
	    let foundData = [];
	    for (response in data){
		if(response['success']){
		    dataFound = true;
		    foundData.append(response['data']);
		}
	    }
	    if (!dataFound) {
		// request from google!
		// pick random peer to handle google request
		google_requester = peer_ids[ Math.floor(Math.random()*peer_ids.length) ];
		google_request = {...request,
				  'type':'google'};
		doRequest(google_request,google_requester).then((data)=>{
		    return data;
		});
	    } else {
		// return found data!
		return foundData[0];
	    }
	});
    },'json')
}

// end peerJS connection code
























// when to return cache info back to user?
// when to send cache info to peer?
// checks

// any points in circle = success
// limitation of implementation, but this is just a proof of concept

// not req - response
// instead all items w/ lat and long; query points in lat and long

// // Declare a global variable for the cache
// var globalCache = null;

// // Function to initialize the global cache
// async function initializeGlobalCache() {
//   try {
//     // Open the cache
//     globalCache = await caches.open('my-global-cache');
//   } catch (error) {
//     console.error('Error initializing global cache:', error);
//   }
// }

// // Use the globalCache variable in other functions or parts of your code
// async function addToGlobalCache(key, value) {
//   try {
//     if (!globalCache) {
//       await initializeGlobalCache();
//     }

//     // Add to the cache
//     await globalCache.put(key, new Response(value));

// 	console.log(key)

// 	keys_list = await globalCache.keys()
// 	console.log(keys_list)

//   } catch (error) {
//     console.error('Error adding to global cache:', error);
//   }
// }



// const cachesToThrow = ['my-global-cache'];
	
// caches.keys().then((keyList) =>
// Promise.all(
// 	keyList.map((key) => {
// 	if (cachesToThrow.includes(key)) {
// 		return caches.delete(key);
// 	}
// 	}),
// ),
// ),



// initializeGlobalCache()

// addToGlobalCache(new Request(JSON.stringify([oldLoc.latitude, oldLoc.longitude, oldRad, oldType])), results)
