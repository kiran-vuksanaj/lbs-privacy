// const { geolib } = require("./geolib")

// **** map generation code ****
let map
let service
let infowindow
let map2

let start = Date.now()
let dummy = false
let mostRecentLoc = NaN
let mostRecentRad = NaN
let mostRecentQuery = NaN

// -33.8665433,151.1956316

let cache = {
	'restaurants': new Set(),
	'gas stations': new Set(),
	'hotels': new Set(),
	'cafes': new Set(),
}

async function callNewMap(data) {
    
	// vals for functions
    lat = data.lat.value;
    long = data.long.value;
    query = data.query.value;
	dummy = data.dummy.checked;
	caching = data.caching.checked;
	peerToPeer = data.peers.checked;
    var loc = new google.maps.LatLng(lat, long);
	var rad = '500'

	// store globally for cache use
	mostRecentLoc = {'latitude': parseFloat(lat), 'longitude': parseFloat(long)}
	mostRecentRad = parseInt('500')
	mostRecentQuery = query

	// map still centers on original
	map = new google.maps.Map(document.getElementById('map'), {
        center: loc,
        zoom: 15
        });
	infowindow = new google.maps.InfoWindow({
		content: "N/A",
		ariaLabel: "Uluru",
	});

	start = Date.now();

	// if using cache, see if there are any places that match up in cache 
	if (caching) {
		personalCache = checkCache(loc, rad, query);
	} else {
		personalCache = [];
	}

	// if using dummy, make dummy location and rad
	if (dummy) {
		dummyLoc = dummyLocation({'latitude': lat, 'longitude': long}, rad);
		loc = new google.maps.LatLng(dummyLoc.point.latitude,dummyLoc.point.longitude);
		rad = dummyLoc.radius;
	}

	// if using peers, check p2p network
	if (peerToPeer && personalCache.length == 0) {
		var peer_request =  {
			'type':'request',
			'latlng': JSON.stringify(loc),
			'radius': rad,
			'query': query
		};

		peerInfo = await queryPeers(peer_request);

		console.log("PEER INFO", peerInfo)
		console.log(peerInfo.data)

		// TODO do we want peer results in our personal cache? rn that's gonna be a.. yes!
	} else {
		peerInfo = []
	}

	// now, map places. case 1: personal cache; case 2: p2p; case 3: normal google req
	if (personalCache.length > 0) {
		callback(personalCache, google.maps.places.PlacesServiceStatus.OK)

	} else if (peerInfo.length > 0) {
		// if peerInfo is real
		callback(peerInfo, google.maps.places.PlacesServiceStatus.OK)

		console.log("cache: ", cache)

	} else {
		var google_request = {
			location: loc,
			radius: rad,
			type: [query]
		};

		service = new google.maps.places.PlacesService(map);
		service.nearbySearch(google_request, callback);
	
	}
}

function initMap() {
}


function checkCache(location, radius, query) {
	points = cache[query]

	out = []
	for (const place of points) {
		if (!(typeof(place.geometry.location.lat) == 'number')) {
			placeLoc = {'latitude': place.geometry.location.lat(),'longitude': place.geometry.location.lng()}
		} else {
			placeLoc = {'latitude': place.geometry.location.lat,'longitude': place.geometry.location.lng}
		}

		if (!isMarkerOutsideCircle(placeLoc, location, radius)) {
			out.push(place)
		}
	}
	return out

}
    
function callback(results, status) {
	// makes markers when nearby search is done, used to measure when function is complete in each case
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

	// any place should get added to the cache
	cache[mostRecentQuery].add(place)

	// check if in target radius
	if (!(typeof(place.geometry.location.lat) == 'number')) {
		checkLoc = {'latitude': place.geometry.location.lat(), 'longitude': place.geometry.location.lng()}
	} else {
		checkLoc = {'latitude': place.geometry.location.lat, 'longitude': place.geometry.location.lng}
	}
	if (isMarkerOutsideCircle(
		checkLoc, 
		mostRecentLoc,
		mostRecentRad)) {
		return
	}

	// make marker to display!
    const marker = new google.maps.Marker({
        map,
        position: place.geometry.location,
    });

    google.maps.event.addListener(marker, "click", () => {
        infowindow.setContent(place.name || "");
        infowindow.open({
			anchor: marker,
			map});
    });
 }

function isMarkerOutsideCircle(point1, point2, r) 
  {
	return geolib.getDistance(point1, point2) > 2*r
  }

// **** end map gen code ****


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
	    console.log(data)
	    // here, there should be distinction made about mode of query! request from google? or check cache?
		if (data.type == 'request') {
			console.log('cache_request')
			cacheInfo = checkCache(JSON.parse(data.latlng), data.radius, data.query)

			console.log("checked cache", cacheInfo)

			if (cacheInfo.length > 0) {
				conn.send( {
					'type':'response',
					'success':true,
					'data': JSON.stringify(cacheInfo)
				});
			} else {
				conn.send( {
					'type':'response',
					'success':false,
					'data': []
				});
			}

		} else if (data.type == 'google') {
			console.log('google_request')
			
			var google_request = {
				location: JSON.parse(data.latlng),
				radius: data.radius,
				type: [data.query]
			};
			doPeerSearchReq(google_request).then((results) => {
				console.log("fulfilled g req", results)
				conn.send( {
					'type':'response',
					'success':true,
					'data':JSON.stringify(results)
				});
			})

		} else {
			conn.send( {
				'type':'response',
				'success':false,
				'data':'none'
			});
		}
	});
    });
});


function doPeerSearchReq(google_request) {
	return new Promise((resolve, reject) => {
		function p2pCallback(results, status) {
			if (status === google.maps.places.PlacesServiceStatus.OK) {
				// add results to cache
				for (const place of results) {
					cache[google_request.type[0]].add(place)
				}

				// Resolve the promise with the results
				resolve(results);
			} else {
				// Reject the promise with an error
				reject(new Error(`Nearby Search failed with status: ${status}`));
			}
		}

		// using fake map for peers
		map2 = new google.maps.Map(document.getElementById('fake_map'), {
			center: google_request.latlng,
			zoom: 15
		});

		service = new google.maps.places.PlacesService(map2);
		service.nearbySearch(google_request, p2pCallback);
	
	});

}

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

	return new Promise((resolve, reject) => {

    $.get('/api/get_group', function(data) {
		const peer_ids = data['peer_ids'];
		if (peer_ids.includes(PEER_ID)) {
			// remove self from group list
			peer_ids.splice( peer_ids.indexOf(PEER_ID), 1 );
		}
		console.log(peer_ids)
		const request_local = {...request,
					'mode':'local'};

		const timeoutPromise = new Promise((resolve,reject) => {
			// timeout promise
			setTimeout(resolve,TIMEOUT_MS,[{'success':false}]);
		});

		
		const local_cache_promises = [];
		for(let i=0; i<peer_ids.length; i++) {
			// for each peer, connect and request a local query
			local_cache_promises.push( doRequest(request_local,peer_ids[i]) );
			
		}
		Promise.any([timeoutPromise,Promise.any(local_cache_promises)]).then((data)=>{
			console.log('all complete');
			// console.log(data);

			// if query not matched, continue to request from google
			// TODO what if other queries are taking longer
			let dataFound = false;
			let foundData = [];
			if(data['success']){
				dataFound = true;
				places = JSON.parse(data['data']);
				for (place of places) {
					foundData.push(place);
				}
			}

			if (!dataFound) {
			// request from google!
			// pick random peer to handle google request
			google_requester = peer_ids[ Math.floor(Math.random()*peer_ids.length) ];
			google_request = {...request,
					'type':'google'};
			doRequest(google_request, google_requester)
				.then((data)=> {
					let foundData = [];
					places = JSON.parse(data['data']);
					for (place of places) {
						foundData.push(place);
					}
					resolve(foundData)
				}) // resolve with Google request result
				.catch((error) => reject(error));
			} else {
				// return found data!
				resolve(foundData);
			}
		})
        .catch((error) => {
			reject(error);
		});
    },'json')

	});

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


		// for (response in data){
		// 	if(response['success']){
		// 		dataFound = true;
		// 		places = JSON.parse(response['data']);
		// 		console.log(places)
		// 		foundData.append(places);
		// 	}
	    // }