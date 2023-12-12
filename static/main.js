console.log('hi')


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
