
function Synth(sampleRate) {
	this.sampleRate = sampleRate; 
	this.generators = [];
}

Synth.prototype.addGenerator = function(generator) {
	this.generators.push(generator);
}

Synth.prototype.generateIntoBuffer = function(samplesToGenerate, buffer, offset) {
	for (var i = offset; i < offset + samplesToGenerate * 2; i++) {
		buffer[i] = 0;
	}
	for (var i = this.generators.length - 1; i >= 0; i--) {
		this.generators[i].generate(buffer, offset, samplesToGenerate);
		if (!this.generators[i].alive) this.generators.splice(i, 1);
	}
}
	
Synth.prototype.generate = function(samples) {
	var data = new Array(samples*2);
	generateIntoBuffer(samples, data, 0);
	return data;
}

Synth.midiToFrequency = function(note) {
	return 440 * Math.pow(2, (note-69)/12);
}

Synth.program = {
	Piano: {
		'attackAmplitude': 0.2,
		'sustainAmplitude': 0.1,
		'attackTime': 0.02,
		'decayTime': 0.3,
		'releaseTime': 0.02,
		'createNote': function(note, velocity, synth) {
			var frequency = Synth.midiToFrequency(note);
			return new ADSRGenerator(
				new SineGenerator(frequency, synth),
				this.attackAmplitude * (velocity / 128), this.sustainAmplitude * (velocity / 128),
				this.attackTime, this.decayTime, this.releaseTime, synth
			);
		}
	},
	String: {
		'createNote': function(note, velocity, synth) {
			var frequency = Synth.midiToFrequency(note);
			return new ADSRGenerator(
				new SineGenerator(frequency, synth),
				0.5 * (velocity / 128), 0.2 * (velocity / 128),
				0.4, 0.8, 0.4, synth
			);
		}
	}
}

Synth.PROGRAMS = {
	41: Synth.program.String,
	42: Synth.program.String,
	43: Synth.program.String,
	44: Synth.program.String,
	45: Synth.program.String,
	46: Synth.program.String,
	47: Synth.program.String,
	49: Synth.program.String,
	50: Synth.program.String
};

////////////////// Sine Generator Class

function SineGenerator(freq, synth) {
	this.alive = true;
	this.freq = freq;
	this.synth = synth;
	this.period = this.synth.sampleRate / freq;
	this.t = 0;
}	
SineGenerator.prototype.generate = function(buf, offset, count) {
	for (; count; count--) {
		var phase = this.t / this.period;
		var result = Math.sin(phase * 2 * Math.PI);
		buf[offset++] += result;
		buf[offset++] += result;
		this.t++;
	}
}
	
////////////////// Square Generator Class

function SquareGenerator(freq, phase, synth) {
	this.alive = true;
	this.freq = freq;
	this.synth = synth;
	this.phase = phase;
	this.period = this.synth.sampleRate / freq;
	this.t = 0;
}	
SquareGenerator.prototype.generate = function(buf, offset, count) {
	for (; count; count--) {
		var result = ( (this.t / this.period) % 1 > this.phase ? 1 : -1);
		buf[offset++] += result;
		buf[offset++] += result;
		this.t++;
	}
}
	

////////////////// ADSR Generator Class

function ADSRGenerator(child, attackAmplitude, sustainAmplitude, attackTimeS, decayTimeS, releaseTimeS, synth) {
	this.alive = true;
	this.child = child;
	this.synth = synth;
	this.attackAmplitude = attackAmplitude;
	this.sustainAmplitude = sustainAmplitude;
	this.attackTimeS = attackTimeS;
	this.decayTimeS = decayTimeS;
	this.releaseTimeS = releaseTimeS;
	this.attackTime = this.synth.sampleRate * attackTimeS;
	this.decayTime = this.synth.sampleRate * (attackTimeS + decayTimeS);
	this.decayRate = (attackAmplitude - sustainAmplitude) / (this.decayTime - this.attackTime);
	this.releaseTime = null; /* not known yet */
	this.endTime = null; /* not known yet */
	this.releaseRate = sustainAmplitude / (this.synth.sampleRate * releaseTimeS);
	this.t = 0;
}

ADSRGenerator.prototype.noteOff = function() {
	if (this.released) return;
	this.releaseTime = this.t;
	this.released = true;
	this.endTime = this.releaseTime + this.sampleRate * this.releaseTimeS;
}
	
ADSRGenerator.prototype.generate = function(buf, offset, count) {
	if (!this.alive) return;
	var input = new Array(count * 2);
	for (var i = 0; i < count*2; i++) {
		input[i] = 0;
	}
	this.child.generate(input, 0, count);
		
	var childOffset = 0;
	while(count) {
		if (this.releaseTime != null) {
			if (this.t < this.endTime) {
				/* release */
				while(count && this.t < this.endTime) {
					var ampl = this.sustainAmplitude - this.releaseRate * (this.t - this.releaseTime);
					buf[offset++] += input[childOffset++] * ampl;
					buf[offset++] += input[childOffset++] * ampl;
					this.t++;
					count--;
				}
			} else {
				/* dead */
				this.alive = false;
				return;
			}
		} else if (this.t < this.attackTime) {
			/* attack */
			while(count && this.t < this.attackTime) {
				var ampl = this.attackAmplitude * this.t / this.attackTime;
				buf[offset++] += input[childOffset++] * ampl;
				buf[offset++] += input[childOffset++] * ampl;
				this.t++;
				count--;
			}
		} else if (this.t < this.decayTime) {
			/* decay */
			while(count && this.t < this.decayTime) {
				var ampl = this.attackAmplitude - this.decayRate * (this.t - this.attackTime);
				buf[offset++] += input[childOffset++] * ampl;
				buf[offset++] += input[childOffset++] * ampl;
				this.t++;
				count--;
			}
		} else {
			/* sustain */
			while(count) {
				buf[offset++] += input[childOffset++] * this.sustainAmplitude;
				buf[offset++] += input[childOffset++] * this.sustainAmplitude;
				this.t++;
				count--;
			}
		}
	}
}
	








