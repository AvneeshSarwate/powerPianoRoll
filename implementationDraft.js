

class PianoRoll {
    constructor(canvas){
        this.canvas = canvas;
        this.canvasHeight = canvas.height;
        this.canvasWidth = canvas.width;
        this.numNotesShown = 20; //always an integer
        this.numMeasuresHown = 4; //always a multiple of 1/16

        /* This means bottom of the 60-block is aligned with the center.
         * 60.5 would mean the center is aligned with halfway through the 60-block */ 
        this.centerNote = 60; //notes are 0-indexed

        /* This means left-end of the 2-block is aligned with the center.
         * 2.5 would mean the center is aligned with halfway through the 2-block */
        this.centerMeasure = 2; //measures are 0-indexed

        this.notes = [];
    }



    drawBackground(){
        //draw the "white key" color background


        //calculate where horizontal block divisions are
        //draw the "black key" horizontal blocks
        //draw the horizontal lines

        //calculate where vertical lines are
    }

    drawNotes(){

    }
}

/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a "viewbox" that shows a sub-area of that.
Because of this, for a piano roll, you can "draw" a piano-roll at an arbitrary size and move around
the viewbox rather than "redrawing" the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
In general, aiming for Ableton piano-roll feature parity wrt mouse interaction (assuming keyboard shortcut
is trivial to implement if you can get the mouse stuff right)

order of library features to test (for each, make sure they're sensible under viewbox zoom too):
- X - dragging behavior 
- X - dragging and snap to grid
- multiselection + dragging via mouse
    - see what visualization of selections looks like and tweak it
- multiselection + dragging + snap to grid
- multiselection and ableton style resizing
- multiselected resizing + snap to grid
- figure out good UI for viewbox resizing/position control (panzoom plugin if necessary?)
    - figure out how to map mouse coordinates to SVG coordinates

Except for zoom events, which will likely be attatched to the root SVG element, events/plugins will
only be added to the "note" svg elements

*/

//testing SVG library api
var draw;
var l1, l2;

function snapToNearest(elem, xSize, ySize){
    elem.x(Math.round(elem.x()/xSize) * xSize);
    elem.y(Math.round(elem.y()/ySize) * ySize);
}

SVG.on(document, 'DOMContentLoaded', function() {
    var boxSize = 200;
    draw = SVG('drawing').size(300, 300);
    var rect = draw.rect(boxSize, boxSize).attr({ fill: '#f06' });
    var rect2 = draw.rect(boxSize, boxSize).attr({ fill: '#0f6' }).move(boxSize, 0);
    var rect3 = draw.rect(boxSize, boxSize).attr({ fill: '#60f' }).move(0, boxSize);
    var rect4 = draw.rect(boxSize, boxSize).attr({ fill: '#f60' }).move(boxSize, boxSize);
    l1 = draw.line(300,0,300,200).stroke({width: 10});
    l2 = draw.line(100,0,100,200).stroke({width: 10});
    draw.viewbox(0, 0, 400, 400);
})


/* scratch code for live-coding development/testing
l1.draggable().on('dragend', function(event){snapToNearest(this, 50, 200)})

*/