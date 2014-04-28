;(function() {

  var ocradWorker = new Worker('http://localhost/javascript/ocrad.js/worker.js');
  var lastWorker;
  PDFJS.workerSrc = 'http://localhost/javascript/pdf.js/build/pdf.worker.js';
  var Zonescanner = window.Zonescanner = function (params) {
    this.canvasPrimary = params.canvasPrimary;
    this.canvasSecondary = params.canvasSecondary;
    this.canvasOriginal = params.canvasOriginal;
    this.contextPrimary = this.canvasPrimary.getContext('2d');
    this.contextSecondary = this.canvasSecondary.getContext('2d');
    this.contextOriginal = this.canvasOriginal.getContext('2d');
    this.outputEl = params.outputEl;
    this.currentImg = null,

    this.zoomRatio = 1,
    this.zoom = params.zoom;
    this.drag = false;
    this.selectionCoordinates = {};

    this.canvasWidth = this.canvasPrimary.parentElement.offsetWidth;

    this.init();
  };

  Zonescanner.prototype = {
    init: function() {
      this.attachSelectionEvents();
      this.attachFilerDropHandler();
    },
    drawSelectionBox: function(context) {
      context.strokeRect(
        this.selectionCoordinates.x,
        this.selectionCoordinates.y,
        this.selectionCoordinates.width,
        this.selectionCoordinates.height
      );
    },
    attachFilerDropHandler: function(){
      var self = this;
      document.body.ondragover = function(){ document.body.className = 'dragging'; return false }
      document.body.ondragend = function(){ document.body.className = ''; return false }
      document.body.onclick = function(){document.body.className = '';}
      document.body.ondrop = function(e){
        e.preventDefault();
        document.body.className = '';
        self.loadFile(e.dataTransfer.files[0]);
        return false;
      }
    },
    attachSelectionEvents: function(){
      var self = this;
      self.canvasPrimary.onmousedown = function(e){
        e.preventDefault();
        self.drag = true;
        var mousePos = getMousePosition(self.canvasPrimary, e);
        self.selectionCoordinates.x = mousePos.x;
        self.selectionCoordinates.y = mousePos.y;
        self.canvasPrimary.onmousemove(e);
      };
      self.canvasPrimary.onmouseup = function(e){
        e.preventDefault();
        self.drag = false;
        var mousePos = getMousePosition(self.canvasPrimary, e);
        self.selectionCoordinates.width = mousePos.x - self.selectionCoordinates.x;
        self.selectionCoordinates.height = mousePos.y - self.selectionCoordinates.y;

        if(self.currentImg){
          //we need to get it from the original canvas with new coordinates
          var scale = (1/self.zoomRatio) * self.zoom,
            image_data = self.contextOriginal.getImageData(
            self.selectionCoordinates.x * scale,
            self.selectionCoordinates.y * scale,
            self.selectionCoordinates.width * scale,
            self.selectionCoordinates.height * scale
          );

          var newCanvas = document.createElement("CANVAS");
          newCanvas.setAttribute("width", image_data.width);
          newCanvas.setAttribute("height", image_data.height)
          newCanvas.getContext("2d").putImageData(image_data, 0, 0);

          // resize canvas to accomodate for new size
          self.canvasSecondary.width = image_data.width * scale;
          self.canvasSecondary.height = image_data.height * scale;

          self.contextSecondary.fillRect(0, 0, self.canvasSecondary.width, self.canvasSecondary.height)
          self.contextSecondary.save();
          self.contextSecondary.scale(scale, scale);
          self.contextSecondary.drawImage(newCanvas, 0, 0);
          self.contextSecondary.restore();

          self.runOCR(image_data);
        }
      };
      self.canvasPrimary.onmousemove = function(e){
        e.preventDefault()
        if(!self.currentImg) {
          debugger;
          return;
        }
        if(self.drag){
          var mousePos = getMousePosition(self.canvasPrimary, e);
          self.selectionCoordinates.width = mousePos.x - self.selectionCoordinates.x;
          self.selectionCoordinates.height = mousePos.y - self.selectionCoordinates.y;
          reset_canvas(self.canvasPrimary);
          self.contextPrimary.drawImage( self.currentImg, 0, 0 );
          self.drawSelectionBox(self.contextPrimary);
        }
      };
    },
    pageToCanvas: function (ratio, canvas, page) {
      var self = this;
      reset_canvas(canvas);
      var viewport = page.getViewport(ratio),
      ctx = canvas.getContext('2d');

      // Prepare canvas using PDF page dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page into canvasPrimary context
      page.render({canvasContext: ctx, viewport: viewport}).then(
        function(e){
          var image = new Image();
          image.src = canvas.toDataURL("image/png");
          //redraw on purpose: seems to fix canvas display issue (black areas)
          reset_canvas(canvas);
          ctx.drawImage( image, 0, 0 );
          // TODO >> ??
          debugger;
          self.currentImg = image;
        }
      );
    },
    loadFile: function (file){
      var self = this;
      if(!file) return;

      self.outputEl.className = 'processing'

      var ext = file.name.split('.').slice(-1)[0];
      var reader = new FileReader();

      if(ext == 'pdf'){
        reader.onload = function(){
          PDFJS.getDocument(reader.result).then(function getPdf(pdf) {

            pdf.getPage(1).then(function getPdfPage(page) {
              self.pageToCanvas( self.zoom, self.canvasOriginal, page );
              self.zoomRatio = self.canvasWidth / page.getViewport(1).width;
              self.pageToCanvas( self.zoomRatio, self.canvasPrimary, page );
            });

          });
        }
        reader.readAsArrayBuffer(file);

      }else{
        // reader.onload = function(){
        //   var img = new Image();
        //   img.src = reader.result;
        //   img.onerror = function(){
        //     reset_canvas(self.canvasPrimary);
        //     contextPrimary.font = '30px sans-serif'
        //     contextPrimary.fillText('Error: Invalid Image ' + file.name, 50, 100);
        //   }
        //   img.onload = function(){
        //     document.getElementById("text").innerHTML = 'Recognizing Text... This may take a while...'
        //     reset_canvas(self.canvasPrimary);
        //     var rat = Math.min(self.canvasPrimary.width / img.width, self.canvasPrimary.height / img.height);
        //     contextPrimary.drawImage(img, 0, 0, img.width * rat, img.height * rat)
        //     var tmp = document.createElement('canvas')
        //     tmp.width = img.width;
        //     tmp.height = img.height;
        //     var ctx = tmp.getContext('2d');
        //     ctx.drawImage(img, 0, 0);
        //     self.currentImg = img;
        //     var image_data = ctx.getImageData(0, 0, tmp.width, tmp.height);
        //     self.runOCR(image_data);
        //   }
        // }
        // reader.readAsDataURL(file)
      }
    },
    runOCR: function(image_data){
      var self = this;
      self.outputEl.className = 'processing';
      ocradWorker.onmessage = function(e){
        self.outputEl.className = '';
        var processingTime = ((Date.now() - start)/1000).toFixed(2);
        self.ocrResultHandler( { result: e.data, time: processingTime } );
      }
      var start = Date.now()
      ocradWorker.postMessage(image_data)
      lastWorker = ocradWorker;
    },
    ocrResultHandler: function( data ) {
      this.outputEl.innerHTML = data.result + "<div class='time'>" + "processed in " + data.time + " s" + "</div>";
    }
  };

  // helpers
  function reset_canvas(canvas){
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'black'
  };

  function getMousePosition(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
  }

})();
