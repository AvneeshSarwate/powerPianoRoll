let arrayOf = n => Array.from(new Array(n), () => 0);

// let sampler = new Tone.Sampler({
//     'A#5': 'WPPApollo2mpA_S_5.wav',
//     'A1': 'WPPApollo2mpA1.wav',
//     'B2': 'WPPApollo2mpB2.wav',
//     'C#4': 'WPPApollo2mpC_S_4.wav',
//     'C0': 'WPPApollo2mpC0.wav',
//     'D#5': 'WPPApollo2mpD_S_5.wav',
//     'D1': 'WPPApollo2mpD1.wav',
//     'E2': 'WPPApollo2mpE2.wav',
//     'F#3': 'WPPApollo2mpF_S_3.wav',
//     'F6': 'WPPApollo2mpF6.wav',
//     'G#4': 'WPPApollo2mpG_S_4.wav',
//     'G0': 'WPPApollo2mpG0.wav'
// });

let sampler = new Tone.Sampler({
            "A0" : "A0.[mp3|ogg]",
            "C1" : "C1.[mp3|ogg]",
            "D#1" : "Ds1.[mp3|ogg]",
            "F#1" : "Fs1.[mp3|ogg]",
            "A1" : "A1.[mp3|ogg]",
            "C2" : "C2.[mp3|ogg]",
            "D#2" : "Ds2.[mp3|ogg]",
            "F#2" : "Fs2.[mp3|ogg]",
            "A2" : "A2.[mp3|ogg]",
            "C3" : "C3.[mp3|ogg]",
            "D#3" : "Ds3.[mp3|ogg]",
            "F#3" : "Fs3.[mp3|ogg]",
            "A3" : "A3.[mp3|ogg]",
            "C4" : "C4.[mp3|ogg]",
            "D#4" : "Ds4.[mp3|ogg]",
            "F#4" : "Fs4.[mp3|ogg]",
            "A4" : "A4.[mp3|ogg]",
            "C5" : "C5.[mp3|ogg]",
            "D#5" : "Ds5.[mp3|ogg]",
            "F#5" : "Fs5.[mp3|ogg]",
            "A5" : "A5.[mp3|ogg]",
            "C6" : "C6.[mp3|ogg]",
            "D#6" : "Ds6.[mp3|ogg]",
            "F#6" : "Fs6.[mp3|ogg]",
            "A6" : "A6.[mp3|ogg]",
            "C7" : "C7.[mp3|ogg]",
            "D#7" : "Ds7.[mp3|ogg]",
            "F#7" : "Fs7.[mp3|ogg]",
            "A7" : "A7.[mp3|ogg]",
            "C8" : "C8.[mp3|ogg]"
        }, {
            "release" : 1,
            "baseUrl" : "samp/salamander/", 
            "onload": function() {
                let playHandler = function(pitch, duration='16n'){
                    //if duration is "on" then just do noteOn, if its "off" just do note off
                    let pitchString = typeof pitch === 'string' ? pitch : this.midiPitchToPitchString(pitch);
                    sampler.triggerAttackRelease(pitchString, duration);
                }
                pianoRoll.playHandler = playHandler;
            }
        })
// sampler = new Tone.PolySynth();
let outGain = new Tone.Gain().toMaster();
let preVerb = new Tone.Freeverb();
let postVerb = new Tone.Freeverb();
sampler.connect(preVerb);
postVerb.connect(outGain);
let delays = arrayOf(10).map((e, i) => {
    let del = new Tone.Delay(0, 10);
    preVerb.connect(del);
    del.connect(postVerb);
    return del
});
let evenDelays = n => delays.forEach((d, i) => {d.delayTime.value = i*n});
outGain.gain.value = 0.05;
preVerb.wet.value = 0;
postVerb.wet.value = 0;


//be able to highlight a section of a piano roll and save that phrase to a variable to play. savePhrase(phraseKey)
//add a little row below piano roll that shows names of phrases that are saved