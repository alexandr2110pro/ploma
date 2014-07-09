<html>
<head>
<style>
body {
  font-family: sans-serif;
}
canvas {
  float: left;
  cursor: url('cursors/cursor.cur'), crosshair;
  border: 1px solid gray;
}
img {
  display: none;
}
a {
  padding: 10px;
  line-height: 40px;
  cursor: pointer;
  color: white;
  text-decoration: none;
  -moz-user-select: none;
}
/*http://www.colourlovers.com/palette/3412827/21st*/
#contrast {
  background: #BCBDAC;
}
#sharpness {
  background: #CFBE27;
}
#undo {
  background: #F27435;
}
#save {
  background: #3B2D38;
}
#clear {
  background: #F02475;
}
</style>
</head>

<body>
<canvas id="canvas"></canvas>
<div id="buttons">
  <a id="contrast">Contrast</a>
  <br>
  <a id="sharpness">Sharpness</a>
  <br>
  <br>
  <br>
  <a id="undo">Undo</a>
  <br>
  <a id="save">Save</a>
  <br>
  <br>
  <br>
  <a id="clear">Clear</a>
</div>
<img src="img/image0052-1-b5-4_sm-2.png" id="img"/>
<object id="wtPlugin" type="application/x-wacomtabletplugin">
  <param name="onload" value="pluginLoaded" />
</object>
</body>

<script src='js/ploma_module.js'></script>
<script>
var w = 1300;
var h = 1000;
var ratio = 2;
var cursorOffsetX = 8;
var cursorOffsetY = 8;
var sample = 2;
var isDrawing = false;
var emptyInk = true;
var skipCounter = 0;
var penDownFrame = 0;
var mouseMoveCounter = 0;
var points = [];
var canvas;
var button;
var button2;
var img;
var plugin;
var ctx;
var pat;
var storedImageData;
var penDownTime = 0;
var curX;
var curY;
var lasX;
var lasY;
var latencies = [];

window.onload = function() {
  canvas = document.getElementById('canvas');
  contrast = document.getElementById('contrast');
  sharpness = document.getElementById('sharpness');
  save = document.getElementById('save');
  undo = document.getElementById('undo');
  clear = document.getElementById('clear');
  img = document.getElementById("img");
  plugin = document.getElementById('wtPlugin');
  canvas.setAttribute('width', w * ratio);
  canvas.setAttribute('height', h * ratio);
  canvas.style.width = w;
  canvas.style.height = h;
  ctx = canvas.getContext('2d');
  pat = ctx.createPattern(img,"repeat");
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = pat;
  clearCanvas();

  save.onclick = function(e) {
    window.open(canvas.toDataURL());
  }

  undo.onclick = function(e) {
    ctx.putImageData(storedImageData, 0, 0, 0, 0, w*ratio, h*ratio);
  }

  sharpness.onclick = function(e) {
    var newImageData;
    var weights;
    weights = [0, -1,  0, -1,  5, -1, 0, -1,  0];
    storedImageData = ctx.getImageData(0, 0, w*ratio, h*ratio);
    newImageData = convolute(storedImageData, weights);
    ctx.putImageData(newImageData, 0, 0, 0, 0, w*ratio, h*ratio);
  }

  contrast.onclick = function(e) {
    var newImageData;
    var factor = 40;
    storedImageData = ctx.getImageData(0, 0, w*ratio, h*ratio);
    newImageData = contrastImage(storedImageData, factor);
    ctx.putImageData(newImageData, 0, 0, 0, 0, w*ratio, h*ratio);
  }

  clear.onclick = function(e) {
    clearCanvas();
  }

  canvas.onmousedown = function(e) {
    isDrawing = true;
    penDownFrame = 0;
    mouseMoveCounter++;
    if (!(mouseMoveCounter % 2 === 0)){
      return;
    }
    recordPoint(e);
    penDownTime = Date.now();
    points = [];
    latencies = [];
  };

  canvas.onmousemove = function(e) {
    penDownFrame++;
    recordPoint(e);
  };

  canvas.onmouseup = function(e) {
    isDrawing = false;
    recordPoint(e);
    drawCurve(getSampledPoints(points));
    points = [];
    // calculate average latency
    var sum = 0;
    for ( var i = 0 ; i < latencies.length; i++) {
      sum+= latencies[i];
    }
    //console.log('average latency: ' + sum/latencies.length);
  };

  // init
  redraw();
  
}

// requestAnimFrame shim layer by Paul Irish
var requestAnimFrame = (function(){
  return window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function(callback, element){
      window.setTimeout(callback, 1000 / 60);
    };
})();

function redraw(time) {
  requestAnimFrame(redraw);

  if (!isDrawing) {
    return;
  }

  if((Date.now() - penDownTime) > 40 && (points.length > 10)) {
    var sampledCurve = getSampledPoints(points);
    sampledCurve.push(sampledCurve[sampledCurve.length-1]);
    drawCurve(sampledCurve);
    points = [];
    // start the new curve where this one leaves off
    points.push(sampledCurve[sampledCurve.length-1]);
    penDownTime = Date.now();
  }

};

function drawCurve(pts) {
  var p1 = pts[0];
  var p2 = pts[1];
  var from = p1;
  for (var i = 1; i < pts.length; i++) {
    if(p1) {
      var midPoint = getMidPt(p1, p2);
      var to = midPoint;
      var ctrl = p1;
      var a = [];
      for (var t = 0; t <= 1; t += 0.5) {
        var newPoint = {};
        newPoint.x =
          (1 - t) * (1 - t) * from.x +
          2 * (1 - t) * t * ctrl.x +
          t * t * to.x;
        newPoint.y =
          (1 - t) * (1 - t) * from.y +
          2 * (1 - t) * t * ctrl.y +
          t * t * to.y;
        newPoint.p = (from.p + to.p + ctrl.p) / 3;
        newPoint.e = from.e;
        newPoint.s = from.s;
        newPoint.t = from.t + ((to.t - from.t) /2);
        a.push(newPoint);
      }
      drawSegments(a);
    }
    p1 = pts[i];
    p2 = pts[i+1];
    from = midPoint;
  }
}

function drawSegments(pts) {
  var px;
  var py;
  var minpt;
  var minx;
  var miny;

  for(var i = 0; i < pts.length-1; i++) {
    px = pts[i].x;
    py = pts[i].y;
    x = pts[i+1].x;
    y = pts[i+1].y;
    latencies.push(Date.now() - pts[i].t);

    minpt = getMinPt({x: px, y: py}, pts[i+1]);
    minx = minpt.x;
    miny = minpt.y;

    ctx.lineWidth = Module.calcLineWidth(pts[i+1].p);
    ctx.globalAlpha = calcGlobalAlpha(
      pts[i+1].p,
      pts[i+1].e,
      pts[i+1].s)
    ;

    ctx.translate(minx, miny);
    ctx.beginPath();
    ctx.moveTo(px - minx, py - miny);
    ctx.lineTo(x - minx, y - miny);
    ctx.stroke();
    ctx.closePath();
    ctx.translate(-minx, -miny);
  }
}

/*function calcLineWidth(p) {
  var width;
  if(p < 0.4) {
    width = ((p)/(0.4))*(0.7);
  } else {
    if((p >= 0.4) && (p < 0.7)) {
      width = ((p-0.4)/(0.3))*(2);
    } else {
      if((p >= 0.7) && (p < 0.9)) {
        width = 2.5;
      } else {
        if((p >= 0.9)) {
          width = 2.8;
        }
      }
    }
  }
  return width;
}*/

function calcGlobalAlpha(p, e, s) {
  var alpha;
  if(e) {
    alpha = 0.3+(s/70);
  } else {
    if(p < 0.4) {
      alpha = 0.3;
    } else {
      alpha = 0.9;
    }
  }
  return alpha;
}

function recordPoint(e) {
  var x = e.clientX - cursorOffsetX;
  var y = e.clientY - cursorOffsetY; 
  if (emptyInk) {
    skipCounter++;
    if (skipCounter > 8) {
      emptyInk = false;
    }
  } else {
    if (penDownFrame < 12 && ((Math.floor(Math.random()*20)) === 3)) {
      emptyInk = true;
      skipCounter = 0;
    }
  }
  point = {
    x   : x,
    y   : y,
    p   : plugin.penAPI.pressure,
    t   : Date.now(),
    e   : emptyInk,
    s   : skipCounter
  };
  if(point.p < 0.6) {
    if (Math.floor(Math.random()*100) === 3) {
      point.p = 0.5;
    }
  }
  points.push(point);
}

function getSampledPoints(pts) {
  var newPoints = [];
  for(var i = 0; i < pts.length; i++) {
    if (i%sample === 0) {
      newPoints.push(pts[i]);
    }
    if (i === pts.length-1) {
      newPoints.push(pts[i]);
    }
  }
  return newPoints;
}

function getMinPt(p1, p2) {
  return {
    x: Math.min(p1.x, p2.x) + Math.random()*50,
    y: Math.min(p1.y, p2.y) + Math.random()*50
  };
}

function getMidPt(p1, p2) {
  return {
    x: p1.x + (p2.x - p1.x) / 2,
    y: p1.y + (p2.y - p1.y) / 2,
    p: (p1.p + p2.p) / 2,
    e: p1.e,
    s: p1.s,
    t: p1.t + ((p2.t - p1.t) / 2)
  };
}

function getCurveArea(pts) {
  var minX = pts[0].x;
  var minY = pts[0].y;
  var maxX = pts[0].x;
  var maxY = pts[0].y;
  var area;
  for(var i = 0; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x);
    minY = Math.min(minY, pts[i].y);
    maxX = Math.max(maxX, pts[i].x);
    maxY = Math.max(maxY, pts[i].y);
  }
  area = (maxX - minX)*(maxY - minY);
  return area;
}

function contrastImage(imageData, contrast) {
  var data = imageData.data;
  var factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for(var i=0;i<data.length;i+=4) {
    data[i] = factor * (data[i] - 128) + 128;
    data[i+1] = factor * (data[i+1] - 128) + 128;
    data[i+2] = factor * (data[i+2] - 128) + 128;
    // reduce the saturation?
  }
  return imageData;
}

function convolute(pixels, weights, opaque) {
  var side = Math.round(Math.sqrt(weights.length));
  var halfSide = Math.floor(side/2);
  var src = pixels.data;
  var sw = pixels.width;
  var sh = pixels.height;
  // pad output by the convolution matrix
  var w = sw;
  var h = sh;
  var tmpCanvas = document.createElement('canvas');
  var tmpCtx = tmpCanvas.getContext('2d');
  var output = tmpCtx.createImageData(w, h);
  var dst = output.data;
  // go through the destination image pixels
  var alphaFac = opaque ? 1 : 0;
  for (var y=0; y<h; y++) {
    for (var x=0; x<w; x++) {
      var sy = y;
      var sx = x;
      var dstOff = (y*w+x)*4;
      // calculate the weighed sum of the source image pixels that
      // fall under the convolution matrix
      var r=0, g=0, b=0, a=0;
      for (var cy=0; cy<side; cy++) {
        for (var cx=0; cx<side; cx++) {
          var scy = sy + cy - halfSide;
          var scx = sx + cx - halfSide;
          if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
            var srcOff = (scy*sw+scx)*4;
            var wt = weights[cy*side+cx];
            r += src[srcOff] * wt;
            g += src[srcOff+1] * wt;
            b += src[srcOff+2] * wt;
            a += src[srcOff+3] * wt;
          }
        }
      }
      dst[dstOff] = r;
      dst[dstOff+1] = g;
      dst[dstOff+2] = b;
      dst[dstOff+3] = a + alphaFac*(255-a);
    }
  }
  return output;
};

function clearCanvas(){
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgb(253, 254, 251)';
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, w, h);
}

</script>

</html>