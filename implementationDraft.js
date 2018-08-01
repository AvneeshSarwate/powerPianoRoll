

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
    - TODO - figure out a visual higlight/selection mechanism - 
      the selection plugin doesn't do that on its own
- X - multiselection + dragging + snap to grid
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
var dragStartReference;
var notes = {};
function snapToNearest(elem, xSize, ySize){
    elem.x(Math.round(elem.x()/xSize) * xSize);
    elem.y(Math.round(elem.y()/ySize) * ySize);
}
var selectedElements;

function setHandlersForNote(noteElement){
    var noteIds = selectedElements.map(elem => elem.noteId);

    noteElement.draggable().on('beforedrag', function(event){
        // console.log('beforeDragStart', this.noteId);
        dragStartReference = {};
        noteIds.forEach(function(id){ 
            dragStartReference[id] = {x: notes[id].x(), y: notes[id].y()};
        });
        // console.log('beforeDrag', dragStartReference);
    });
    noteElement.draggable().on('dragmove', function(event){
        var xMove = this.x() - dragStartReference[this.noteId].x;
        var yMove = this.y() - dragStartReference[this.noteId].y;
        var thisId = this.noteId;
        noteIds.forEach(function(id){
            if(id === thisId) return;
            else {
                notes[id].x(dragStartReference[id].x + xMove);
                notes[id].y(dragStartReference[id].y + yMove);
            }
        });
    });
    noteElement.off('dragend'); //remove the original dragend function;
    noteElement.draggable().on('dragend', function(event){
        selectedElements.forEach(function(elem){
            snapToNearest(elem, 50, 200);
        })
    });
}

SVG.on(document, 'DOMContentLoaded', function() {

    //set up a background that you can see elements against, which will 
    //later be the piano roll backdrop
    var boxSize = 200;
    draw = SVG('drawing').size(300, 300);
    var rect = draw.rect(boxSize, boxSize).attr({ fill: '#f06' });
    var rect2 = draw.rect(boxSize, boxSize).attr({ fill: '#0f6' }).move(boxSize, 0);
    var rect3 = draw.rect(boxSize, boxSize).attr({ fill: '#60f' }).move(0, boxSize);
    var rect4 = draw.rect(boxSize, boxSize).attr({ fill: '#f60' }).move(boxSize, boxSize);

    //set up the manipulatable elements (which will later be the notes)
    l1 = draw.line(300,0,300,200).stroke({width: 10});
    l2 = draw.line(100,0,100,200).stroke({width: 10});

    //every new note created will have a newly generated noteId. this
    //is a quick setup to show what the note management will look like
    notes = {0: l1, 1: l2};
    l1.noteId = 0;
    l2.noteId = 1;
    Object.keys(notes).forEach(function(key){ //adding snap-to-grid
        notes[key].draggable().on('dragend', function(event){ snapToNearest(this, 50, 200)});
    });



    
    //this will be the end-state of a select mouse gesture that ranges
    //over some set of note elements. Again, just a quick hack setup to
    //test the interaction
    selectedElements = [l1, l2];
    selectedElements.forEach(setHandlersForNote);

    //after you click to the background to "unselect" the selected notes,
    //release all the drag event handlers
    // selectedElements.forEach(function(elem){
    //     elem.off('beforedrag');
    //     elem.off('dragmove');
    //     elem.off('dragend');
    //     elem.on('dragend', function(event){snapToNearest(this, 50, 200)})
    // });
        
    draw.viewbox(0, 0, 400, 400);
});


/* scratch code for live-coding development/testing
l1.draggable().on('dragend', function(event){snapToNearest(this, 50, 200)})

*/