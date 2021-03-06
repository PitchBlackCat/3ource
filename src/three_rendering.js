if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

var container, stats;
var camera, scene, renderer, particles,
spriteGeometry, material, i, h, color, sprite, size;

var projector, raycaster;
var mouseX = 0, mouseY = 0;

var PARTICLES = 2000; // Particle Pool
var LINES = 5000; // Lines Pool
var LINE_WIDTH = 1.0;


var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

offset = new THREE.Vector3();
color = new THREE.Color();
tmp = new THREE.Vector3();

var extension_colors = {};

var bezier = new THREE.QuadraticBezierCurve(new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2());

/* Graph functions */
function newNode(name, isFile, x, y) {
	var node = new gNode(name, isFile, x, y);
	// TODO
	// Histogram count / sort
	// Equidistance colors
	// Common File Types.

	if (isFile) {
		fileNodes.push(node);

		var filename = name.split('/').pop();
		var split = filename.lastIndexOf('.');

		// If no extension or hidden file (eg. .gitignore)
		var ext = split > 0 ? filename.substring(split + 1).toLowerCase() : '';

		node.ext = ext;
		node.sat = Math.random() * 0.5 + 0.5;

		if (!extension_colors[ext]) {
			extension_colors[ext] = Math.random();
			color.setHSL(extension_colors[ext], 0.5, 0.5);
			var div = document.createElement('div');
			div.style.cssText = 'background-color: #' + color.getHexString() + ';';
			div.innerText = '.' + ext;
			color_legend.appendChild(div);

		}

	} else {
		nodes.push(node);
	}

	node.life = 0;

	return node;
}

function newEdge(parent, child, isFile) {
	var distance = isFile ? 0.5 : 10;
	if (isFile) {
		clusters.push(new gLink(parent, child, distance, isFile));
	} else {
		var link = new gLink(parent, child, distance, isFile);
		links.push(link);
	}
}

function removeNode(node, graphNode) {
	var indexOf, i;
	if (node.isFile()) {
		indexOf = fileNodes.indexOf(graphNode);
		if (indexOf<0) {
			console.warn('Cannot find index in fileNodes');
		}
		fileNodes.splice(indexOf, 1);

		for (i=clusters.length; i-- > 0;) {
			if (clusters[i].to == graphNode) {
				clusters.splice(i, 1);
			}
		}

	} else {
		indexOf = nodes.indexOf(graphNode);
		if (indexOf<0) {
			console.warn('Cannot find index in nodes');
		}
		nodes.splice(indexOf, 1);

		for (i=links.length; i-- > 0;) {
			if (links[i].to == graphNode) {
				links.splice(i, 1);
			}
		}
	}
}


function initDrawings() {

	container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 25, window.innerWidth / window.innerHeight, 0.1, 10000 );
	camera.position.z = 50; // 75

	scene = new THREE.Scene();
	// scene.fog = new THREE.FogExp2( 0x000000, 0.001 );

	// geometry = new THREE.Geometry();
	spriteGeometry = new THREE.ParticleGeometry( PARTICLES, 5 * 1.5);

	sprite = THREE.ImageUtils.loadTexture( "disc.png" );

	var spriteOptions = {
		uniforms: {
			time: { type: "f", value: 1.0 },
			depth: { type: "f", value: 0.0 },
			texture: { type: 't', value: sprite },
		},
		attributes: {
			offset: { type: 'v3', value: null },
			rotation: { type: 'v3', value: null },
		},
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
		side: THREE.DoubleSide,
		transparent: true,
		blending: THREE.AdditiveBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.SrcAlphaFactor

	};

	material = new THREE.RawShaderMaterial( spriteOptions );

	spriteGeometry.hideSprite = function(i) {
		spriteGeometry.setSprite( 'offsets', i, 100000, 100000, 0 );
	};

	for ( i = 0; i < PARTICLES; i ++ ) {

		// Math.random() * 2000 - 1000
		spriteGeometry.hideSprite(i);
		spriteGeometry.setSprite( 'rotations', i, 0, 0, 0);

		color.setHSL(0.9, 0.7, 0.8);
		spriteGeometry.setSprite( 'colors', i, color.r, color.g, color.b);

	}


	lineGeometry = new THREE.ParticleGeometry( LINES, 0.1 );

	var lineOptions = {

		uniforms: {
			time: { type: "f", value: 1.0 },
			depth: { type: "f", value: 0.0 },
			texture: { type: 't', value: THREE.ImageUtils.loadTexture( "spark1.png" ) },
		},
		attributes: {
			offset: { type: 'v3', value: null },
			rotation: { type: 'v3', value: null },
		},
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: document.getElementById( 'lineFragmentShader' ).textContent,
		side: THREE.DoubleSide,
		transparent: true,

		blending: THREE.AdditiveBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.SrcAlphaFactor

	};

	var lineMaterial = new THREE.RawShaderMaterial( lineOptions );

	for ( i = 0; i < LINES; i ++ ) {

		lineGeometry.setLine(i, 0.1, 0.1, 0.1, 0.1, LINE_WIDTH); // Hide line (or make -10 on z?)
		// lineGeometry.setSprite( 'offsets', i, Math.random() * 2000 - 1000, Math.random() * 2000 - 1000, Math.random() * 2000 - 1000);
		// lineGeometry.setSprite( 'rotations', i, 0, 0, 0.25);

		color.setHSL(Math.random(), 0.9, 0.9);
		lineGeometry.setSprite( 'colors', i, color.r, color.g, color.b);
	}

	lineMesh = new THREE.Mesh( lineGeometry, lineMaterial );
	scene.add(lineMesh);

	particleMesh = new THREE.Mesh( spriteGeometry, material );

	particleMesh.raycast = ( function () {

		var inverseMatrix = new THREE.Matrix4();
		var ray = new THREE.Ray();
		var vA = new THREE.Vector3();
		var vB = new THREE.Vector3();
		var vC = new THREE.Vector3();

		return function ( raycaster, intersects ) {

			var geometry = this.geometry;
			inverseMatrix.getInverse( this.matrixWorld );
			ray.copy( raycaster.ray ).applyMatrix4( inverseMatrix );

			var material = this.material;

			if ( material === undefined ) return;

			var attributes = geometry.attributes;

			var a, b, c;
			var precision = raycaster.precision;

			var positions = attributes.position.array;
			var offsets = attributes.offset.array;

			var limits = fileNodes.length * 2;

			for ( var i = 0, j = 0, k = 0, il = positions.length; i < il && k < limits; i += 3, j += 9, k++) {

				a = i;
				b = i + 1;
				c = i + 2;

				vA.set(
					positions[ j     ] + offsets[ j     ],
					positions[ j + 1 ] + offsets[ j + 1 ],
					positions[ j + 2 ] + offsets[ j + 2 ]
				);
				vB.set(
					positions[ j + 3 ] + offsets[ j + 3 ],
					positions[ j + 4 ] + offsets[ j + 4 ],
					positions[ j + 5 ] + offsets[ j + 5 ]
				);
				vC.set(
					positions[ j + 6 ] + offsets[ j + 6 ],
					positions[ j + 7 ] + offsets[ j + 7 ],
					positions[ j + 8 ] + offsets[ j + 8 ]
				);


				if ( material.side === THREE.BackSide ) {

					var intersectionPoint = ray.intersectTriangle( vC, vB, vA, true );

				} else {

					var intersectionPoint = ray.intersectTriangle( vA, vB, vC, material.side !== THREE.DoubleSide );

				}

				if ( intersectionPoint === null ) continue;

				intersectionPoint.applyMatrix4( this.matrixWorld );

				var distance = raycaster.ray.origin.distanceTo( intersectionPoint );

				if ( distance < precision || distance < raycaster.near || distance > raycaster.far ) continue;

				var whi = k / 2 | 0;
				intersects.push( {

					distance: distance,
					point: intersectionPoint,
					face: new THREE.Face3( a, b, c, THREE.Triangle.normal( vA, vB, vC ) ),
					faceIndex: k,
					object: this

				} );

				console.log(whi, fileNodes[whi].name);

			}

		};

	}() );

	scene.add( particleMesh );

	//

	projector = new THREE.Projector();
	raycaster = new THREE.Raycaster();


	//

	renderer = new THREE.WebGLRenderer( { clearAlpha: 1 } );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.getContext().getExtension("OES_standard_derivatives");
	container.appendChild( renderer.domElement );


	// renderer.domElement.addEventListener( 'mousemove', onMouseMove, false );


	//

	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	container.appendChild( stats.domElement );

	//

	document.body.addEventListener( 'mousedown', function() {
		moo = true;
	}, false );
	renderer.domElement.addEventListener( 'mousemove', onDocumentMouseMove, false );
	renderer.domElement.addEventListener( 'touchstart', onDocumentTouchStart, false );
	renderer.domElement.addEventListener( 'touchmove', onDocumentTouchMove, false );

	//

	window.addEventListener( 'resize', onWindowResize, false );

	animate();

}

function onWindowResize() {

	windowHalfX = window.innerWidth / 2;
	windowHalfY = window.innerHeight / 2;

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function onDocumentMouseMove( event ) {

	mouseX = event.clientX - windowHalfX;
	mouseY = event.clientY - windowHalfY;
	// console.log('move', mouseX, mouseY);

}

function onDocumentTouchStart( event ) {

	if ( event.touches.length == 1 ) {

		event.preventDefault();

		mouseX = event.touches[ 0 ].pageX - windowHalfX;
		mouseY = event.touches[ 0 ].pageY - windowHalfY;

	}
}

function onDocumentTouchMove( event ) {

	if ( event.touches.length == 1 ) {

		event.preventDefault();

		mouseX = event.touches[ 0 ].pageX - windowHalfX;
		mouseY = event.touches[ 0 ].pageY - windowHalfY;

	}

}

//

function animate() {

	requestAnimationFrame( animate );

	simulate();
	render();
	stats.update();

}

function render() {

	var time = Date.now() * 0.00005;

	// camera.position.x += ( mouseX - camera.position.x ) * 0.05;
	// camera.position.y += ( - mouseY - camera.position.y ) * 0.05;

	// camera.lookAt( scene.position );

	s = {
		lines: links.length,
		files: fileNodes.length,
		directories: nodes.length
	}

	if (links.length > LINES) {
		console.warn('warning, please increase Lines pool size');
	}


	if (fileNodes.length > PARTICLES) {
		console.warn('warning, please increase Particles pool size');
	}

	var j = 0, LINE_SEGMENTS = 10;
	// Draw links
	for (i=0;i<LINES;i++) {
		if (i < links.length) {
			link = links[i];
			var rx = link.average.x - link.current.x;
			var ry = link.average.y - link.current.y;

			bezier.v0.set(link.from.x, link.from.y);
			bezier.v1.set(link.average.x + rx, link.average.y + ry);
			// bezier.v1.set(link.current.x, link.current.y);
			bezier.v2.set(link.to.x, link.to.y);

			lineGeometry.setBezierGrid(j++, bezier.v0, bezier.v1, bezier.v2, LINE_WIDTH);

		} else {
			// hide
			// lineGeometry.setLine(i, 0.1, 0.1, 0.1, 0.1, LINE_WIDTH);
		}
	}

	// console.log(j);
	for (;j<LINES;j++) {
		lineGeometry.setLine(j, 0.1, 0.1, 0.1, 0.1);
	}

	// Flag graphic buffers for update
	lineGeometry.attributes.position.needsUpdate = true;
	lineGeometry.attributes.color.needsUpdate = true;
	lineGeometry.attributes.normal.needsUpdate = true;

	ctx.clearRect(0, 0, innerWidth, innerHeight)
	for (i=0;i<PARTICLES;i++) {
		if (i < fileNodes.length) {
			node = fileNodes[i];
			spriteGeometry.setSprite( 'offsets', i, node.x, node.y, 0 );

			node.life++;

			// color.setStyle(node.color);
			// var c = color.getHSL();
			// color.setHSL(c.h, c.s, Math.max(0.5, 1 - k * k));

			var k = node.life * 0.01;
			k = Math.max(0.5, 1 - k * k);
			color.setHSL(extension_colors[node.ext], node.sat * 0.2 + k * 0.6 + 0.2, k);

			spriteGeometry.setSprite( 'colors', i, color.r, color.g, color.b);

			if (node.life < 200) {
				// prepare label
				label = node.name.substring(node.name.lastIndexOf('/') + 1);
				tmp.set(node.x, node.y, 0).applyMatrix4(particleMesh.matrixWorld);

				tmp = projector.projectVector(tmp, camera);
				if (tmp.x + 1 < 2 && tmp.y + 1 < 2)
				labelNode(tmp, label, !true);
			}
		} else {
			spriteGeometry.hideSprite( i );
		}
	}

	spriteGeometry.attributes.color.needsUpdate = true;
	spriteGeometry.attributes.offset.needsUpdate = true;



	function labelNode(node, label, bubble) {
		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		var r = 10;
		var width = ctx.measureText(label).width * 1;
		var height = 10;

		var x = (node.x + 1) * 0.5 * innerWidth + 5;
		var y = (-node.y + 1) * 0.5 * innerHeight + 5;

		ctx.fillStyle = '#fff';

		if (bubble) {
			ctx.beginPath();
			ctx.moveTo(x, y - height);
			ctx.lineTo(x + width, y - height);
			ctx.quadraticCurveTo(x + width + r, y - height, x + width + r, y);
			ctx.quadraticCurveTo(x + width + r, y + height, x + width, y + height);
			ctx.lineTo(x, y + height);
			ctx.quadraticCurveTo(x - r, y + height, x - r, y);
			ctx.quadraticCurveTo(x - r, y - height, x, y - height);

			ctx.closePath();
			ctx.fill();

			ctx.fillStyle = 'black';
		}

		ctx.beginPath();
		ctx.fillText(label, x, y);

		ctx.restore();
	}


	// find intersections

	if (window.moo) {

		vector = new THREE.Vector3( mouseX / windowHalfX, -1 * mouseY / windowHalfY, 1 );
		// console.log(vector);
		projector.unprojectVector( vector, camera );

		raycaster.set( camera.position, vector.sub( camera.position ).normalize() );


		console.time('check');
		var intersects = raycaster.intersectObjects( scene.children );

		if ( intersects.length > 0 ) {
			console.log(intersects.length)
			console.log(intersects[0])

		} else {



		}
		console.timeEnd('check')

		moo = false;
	}



	renderer.render( scene, camera );

}
