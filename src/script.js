import * as BW from "./brilliantwear/brilliantwear.module.min.js";

window.BW = BW;

// DEVICE HELPERS

/** @typedef {import("./brilliantwear/brilliantwear.module.min.js").Device} Device */

const getDevice = () =>
  BW.DeviceManager.connectedDevices.find((device) => device.hasCamera);

/** @param {(device: Device) => void} callback */
const onCameraDeviceConnected = (callback) => {
  BW.DeviceManager.addEventListener("deviceConnected", (event) => {
    const { device } = event.message;
    if (device.hasCamera) {
      callback(device);
    }
  });
};
/** @param {(device: Device) => void} callback */
const onCameraDeviceNotConnected = (callback) => {
  BW.DeviceManager.addEventListener("deviceNotConnected", (event) => {
    const { device } = event.message;
    if (device.hasCamera && !getDevice()) {
      callback(device);
    }
  });
};
/** @param {(device: Device, isConnected: boolean) => void} callback */
const onCameraDeviceIsConnected = (callback) => {
  onCameraDeviceConnected((device) => callback(device, true));
  onCameraDeviceNotConnected((device) => callback(device, false));
};

// CONNECTION

/** @type {HTMLButtonElement} */
const addDeviceButton = document.getElementById("addDevice");
addDeviceButton.disabled = !(await BW.Device.CanConnect);
addDeviceButton.addEventListener("click", async () => {
  let device = getDevice();
  if (device) {
    addDeviceButton.disabled = true;
    addDeviceButton.innerText = "disconnecting";
    await device.disconnect();
    return;
  }

  addDeviceButton.disabled = true;
  addDeviceButton.innerText = "adding device...";
  device = await BW.Device.Connect();
  if (device) {
    if (!device.hasCamera) {
      window.alert("device doesn't have a camera - disconnecting now");
      await device.disconnect();
    }
  } else {
    addDeviceButton.innerText = "add device";
  }
  addDeviceButton.disabled = false;
});

onCameraDeviceIsConnected((device, isConnected) => {
  const hasDevice = Boolean(getDevice());
  addDeviceButton.innerText = hasDevice ? "disconnect" : "add device";
  addDeviceButton.disabled = false;
});

// DEVICE INFO

/** @type {HTMLSpanElement} */
const nameSpan = document.getElementById("name");

onCameraDeviceIsConnected((device, isConnected) => {
  nameSpan.innerText = isConnected ? device.name : "";
});

/** @type {HTMLSpanElement} */
const hasCameraSpan = document.getElementById("hasCamera");
onCameraDeviceIsConnected((device, isConnected) => {
  hasCameraSpan.innerText = isConnected ? device.hasCamera : "";
});

/** @type {HTMLSpanElement} */
const isCameraDisabledSpan = document.getElementById("isCameraDisabled");
onCameraDeviceConnected((device) => {
  const updateIsCameraDisabledSpan = () => {
    isCameraDisabledSpan.innerText =
      device.isConnected && device.isCameraDisabled ? "(disabled)" : "";
  };
  const { connectionAbortSignal: signal } = device;
  device.addEventListener(
    "cameraStatus",
    () => {
      updateIsCameraDisabledSpan();
    },
    { signal },
  );
  device.addEventListener(
    "notConnected",
    () => {
      updateIsCameraDisabledSpan();
    },
    { signal },
  );
});

/** @type {HTMLSpanElement} */
const hasMicrophoneSpan = document.getElementById("hasMicrophone");
onCameraDeviceIsConnected((device, isConnected) => {
  hasMicrophoneSpan.innerText = isConnected ? device.hasMicrophone : "";
});

/** @type {HTMLSpanElement} */
const isMicrophoneDisabledSpan = document.getElementById(
  "isMicrophoneDisabled",
);
onCameraDeviceConnected((device) => {
  const updateIsMicrophoneDisabledSpan = () => {
    isMicrophoneDisabledSpan.innerText =
      device.isConnected && device.isMicrophoneDisabled ? "(disabled)" : "";
  };
  const { connectionAbortSignal: signal } = device;
  device.addEventListener(
    "microphoneStatus",
    () => {
      updateIsMicrophoneDisabledSpan();
    },
    { signal },
  );
  device.addEventListener(
    "notConnected",
    () => {
      updateIsMicrophoneDisabledSpan();
    },
    { signal },
  );
});

// CAMERA
const takePictureButton = document.getElementById("takePicture");
takePictureButton.addEventListener("click", async () => {
  const device = getDevice();
  if (device) {
    device.takePicture();
  }
});
const updateTakePictureButton = () => {
  const device = getDevice();

  let disabled = true;
  let innerText = "take picture";
  if (device) {
    switch (device.cameraStatus) {
      case "idle":
        disabled = false;
        break;
      case "takingPicture":
        innerText = "taking picture";
        break;
    }
  }
  takePictureButton.disabled = disabled;
  takePictureButton.innerText = innerText;
};
onCameraDeviceIsConnected((device, isConnected) => {
  updateTakePictureButton();
  if (isConnected) {
    device.addEventListener(
      "cameraStatus",
      () => {
        updateTakePictureButton();
      },
      { signal: device.connectionAbortSignal },
    );
  }
});

/** @type {HTMLInputElement} */
const autoPictureCheckbox = document.getElementById("autoPicture");
autoPictureCheckbox.addEventListener("input", () => {
  const device = getDevice();
  if (device) {
    device.autoPicture = autoPictureCheckbox.checked;
  }
});
onCameraDeviceConnected((device) => {
  device.autoPicture = autoPictureCheckbox.checked;
  device.addEventListener(
    "autoPicture",
    () => {
      autoPictureCheckbox.checked = device.autoPicture;
    },
    { signal: device.connectionAbortSignal },
  );
});

/** @type {HTMLProgressElement} */
const cameraImageProgress = document.getElementById("cameraImageProgress");
onCameraDeviceConnected((device) => {
  cameraImageProgress.value = 0;

  device.addEventListener(
    "cameraImageProgress",
    (event) => {
      if (event.message.type == "image") {
        cameraImageProgress.value = event.message.progress;
      }
    },
    { signal: device.connectionAbortSignal },
  );
});

/** @type {HTMLPreElement} */
const cameraImageMetadataPre = document.getElementById("cameraImageMetadata");
/** @type {HTMLImageElement} */
const cameraImage = document.getElementById("cameraImage");
onCameraDeviceConnected((device) => {
  device.addEventListener("cameraImage", async (event) => {
    if (cameraImage.src) {
      URL.revokeObjectURL(cameraImage.src);
    }
    cameraImage.src = event.message.url;

    const tags = await ExifReader.load(event.message.arrayBuffer);

    const cameraImageMetadata = {};
    ["protocol", "capture_state", "dnr_present"].forEach((key) => {
      if (!tags[key]) {
        return;
      }
      cameraImageMetadata[key] = tags[key].value;
    });

    cameraImageMetadataPre.textContent = JSON.stringify(
      cameraImageMetadata,
      null,
      2,
    );
  });
});

/** @type {HTMLSelectElement} */
const setCameraResolutionSelect = document.getElementById(
  "setCameraResolution",
);
const setCameraResolutionOptgroup =
  setCameraResolutionSelect.querySelector("optgroup");
const cameraResolutions = [96, 160, 200, 260, 320, 416, 480, 640, 800, 1024];
cameraResolutions.forEach((cameraResolution) => {
  setCameraResolutionOptgroup.appendChild(
    new Option(
      `${cameraResolution} x ${Math.round((cameraResolution * 3) / 4)}`,
      cameraResolution,
    ),
  );
});
setCameraResolutionSelect.value = cameraResolutions[2];

setCameraResolutionSelect.addEventListener("input", (event) => {
  const resolution = +setCameraResolutionSelect.value;
  const device = getDevice();
  device?.setCameraConfiguration({ resolution });
});
onCameraDeviceConnected((device) => {
  device.setCameraConfiguration({
    resolution: setCameraResolutionSelect.value,
  });
});

/** @type {HTMLSpanElement} */
const cameraQualitySpan = document.getElementById("cameraQuality");

/** @type {HTMLInputElement} */
const cameraQualityInput = document.getElementById("setCameraQuality");
cameraQualityInput.addEventListener("change", () => {
  const device = getDevice();
  const qualityFactor = +cameraQualityInput.value;
  if (device) {
    device.setCameraConfiguration({
      qualityFactor,
    });
  } else {
    cameraQualitySpan.innerText = `${qualityFactor}%`;
  }
});

onCameraDeviceConnected((device) => {
  const qualityFactor = +cameraQualityInput.value;
  device.setCameraConfiguration({
    qualityFactor,
  });
  device.addEventListener(
    "getCameraConfiguration",
    () => {
      const { qualityFactor } = device.cameraConfiguration;
      cameraQualitySpan.innerText = `${qualityFactor}%`;
      cameraQualityInput.value = qualityFactor;
    },
    { signal: device.connectionAbortSignal },
  );
});

// MICROPHONE

/** @type {HTMLButtonElement} */
const toggleMicrophoneButton = document.getElementById("toggleMicrophone");
toggleMicrophoneButton.addEventListener("click", () => {
  const device = getDevice();
  device?.toggleMicrophone();
});
const updateToggleMicrophoneButton = () => {
  const device = getDevice();

  let disabled = true;
  let innerText = "start microphone";
  if (device?.hasMicrophone) {
    switch (device.microphoneStatus) {
      case "idle":
        disabled = false;
        break;
      case "streaming":
        disabled = false;
        innerText = "stop microphone";
        break;
    }
  }
  toggleMicrophoneButton.disabled = disabled;
  toggleMicrophoneButton.innerText = innerText;
};
onCameraDeviceIsConnected((device, isConnected) => {
  updateToggleMicrophoneButton();
  if (isConnected) {
    device.addEventListener(
      "microphoneStatus",
      () => {
        updateToggleMicrophoneButton();
      },
      { signal: device.connectionAbortSignal },
    );
  }
});

/** @type {HTMLSelectElement} */
const setMicrophoneSampleRateSelect = document.getElementById(
  "setMicrophoneSampleRate",
);
const setMicrophoneSampleRateOptgroup =
  setMicrophoneSampleRateSelect.querySelector("optgroup");
BW.MicrophoneSampleRates.forEach((sampleRate) => {
  setMicrophoneSampleRateOptgroup.appendChild(
    new Option(`${+sampleRate / 1000} kHz`, sampleRate),
  );
});
setMicrophoneSampleRateSelect.addEventListener("input", () => {
  const device = getDevice();
  const sampleRate = setMicrophoneSampleRateSelect.value;
  device?.setMicrophoneConfiguration({
    sampleRate,
  });
});
onCameraDeviceConnected((device) => {
  setMicrophoneSampleRateSelect.disabled = !device.hasMicrophone;
  if (device.hasMicrophone) {
    device.setMicrophoneConfiguration({
      sampleRate: setMicrophoneSampleRateSelect.value,
    });
    device.addEventListener(
      "microphoneStatus",
      (event) => {
        setMicrophoneSampleRateSelect.disabled =
          device.microphoneStatus != "idle";
      },
      { signal: device.connectionAbortSignal, immediate: true },
    );
  }
});
setMicrophoneSampleRateSelect.value = BW.MicrophoneSampleRates[1];

/** @type {HTMLSelectElement} */
const setMicrophoneBitDepthSelect = document.getElementById(
  "setMicrophoneBitDepth",
);
const setMicrophoneBitDepthOptgroup =
  setMicrophoneBitDepthSelect.querySelector("optgroup");
BW.MicrophoneBitDepths.forEach((bitDepth) => {
  setMicrophoneBitDepthOptgroup.appendChild(
    new Option(`${bitDepth}-bit`, bitDepth),
  );
});
setMicrophoneBitDepthSelect.addEventListener("input", () => {
  const device = getDevice();
  const bitDepth = setMicrophoneBitDepthSelect.value;
  device?.setMicrophoneConfiguration({
    bitDepth,
  });
});
onCameraDeviceConnected((device) => {
  setMicrophoneBitDepthSelect.disabled = !device.hasMicrophone;
  if (device.hasMicrophone) {
    device.setMicrophoneConfiguration({
      bitDepth: setMicrophoneBitDepthSelect.value,
    });
    device.addEventListener(
      "microphoneStatus",
      (event) => {
        setMicrophoneBitDepthSelect.disabled =
          device.microphoneStatus != "idle";
      },
      { signal: device.connectionAbortSignal, immediate: true },
    );
  }
});
setMicrophoneBitDepthSelect.value = BW.MicrophoneBitDepths[1];

const audioContext = new (window.AudioContext || window.webkitAudioContext)({
  sampleRate: 16_000,
  latencyHint: "interactive",
});
const checkAudioContextState = () => {
  const { state } = audioContext;
  //   console.log({ audioContextState: state });
  if (state != "running") {
    document.addEventListener("click", () => audioContext.resume(), {
      once: true,
    });
  }
};
audioContext.addEventListener("statechange", () => {
  checkAudioContextState();
});
checkAudioContextState();

/** @type {HTMLAudioElement} */
const microphoneStreamAudioElement =
  document.getElementById("microphoneStream");
onCameraDeviceConnected((device) => {
  device.audioContext = audioContext;
  microphoneStreamAudioElement.srcObject =
    device.microphoneMediaStreamDestination.stream;
});

// RECORDING

/** @type {HTMLButtonElement} */
const toggleCameraRecordingButton = document.getElementById(
  "toggleCameraRecording",
);
toggleCameraRecordingButton.addEventListener("click", () => {
  const device = getDevice();
  device?.toggleCameraRecording(microphoneStream);
});

const updateToggleCameraRecordingButton = () => {
  const device = getDevice();

  toggleCameraRecordingButton.innerText = device.isRecordingCamera
    ? "stop recording"
    : "start recording";

  toggleCameraRecordingButton.disabled = !(
    device.isConnected && device.hasCamera
  );
};
onCameraDeviceIsConnected((device, isConnected) => {
  updateToggleCameraRecordingButton();
  if (isConnected) {
    device.addEventListener(
      "isRecordingCamera",
      () => {
        updateToggleCameraRecordingButton();
      },
      { signal: device.connectionAbortSignal },
    );
  }
});

/** @type {HTMLSelectElement} */
const selectMicrophoneSelect = document.getElementById("selectMicrophone");
/** @type {HTMLOptGroupElement} */
const selectMicrophoneOptgroup =
  selectMicrophoneSelect.querySelector("optgroup");
selectMicrophoneSelect.addEventListener("input", () => {
  selectMicrophone(selectMicrophoneSelect.value);
});

selectMicrophoneSelect.addEventListener("click", async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioDevices = devices.filter((device) => device.kind == "audioinput");
  if (audioDevices.length == 1 && audioDevices[0].deviceId == "") {
    const microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    microphoneStream.getAudioTracks().forEach((track) => track.stop());
    updateMicrophoneSources();
  }
});
const updateMicrophoneSources = async () => {
  const mediaDevices = await navigator.mediaDevices.enumerateDevices();
  const audioDevices = mediaDevices.filter(
    (device) => device.kind == "audioinput",
  );
  selectMicrophoneOptgroup.innerHTML = "";
  selectMicrophoneOptgroup.appendChild(new Option("none"));
  selectMicrophoneOptgroup.appendChild(new Option("device"));
  audioDevices.forEach((audioInputDevice) => {
    selectMicrophoneOptgroup.appendChild(
      new Option(audioInputDevice.label, audioInputDevice.deviceId),
    );
  });
  selectMicrophoneSelect.value = "none";
  selectMicrophone(selectMicrophoneSelect.value);
};
/** @type {MediaStream?} */
let microphoneStream;
const selectMicrophone = async (deviceId) => {
  const device = getDevice();

  stopMicrophoneStream();
  if (deviceId == "none") {
    microphoneAudio.setAttribute("hidden", "");
  } else if (deviceId == "device") {
    microphoneStream = device?.microphoneMediaStreamDestination?.stream;
  } else {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: false,
      },
    });
    microphoneAudio.srcObject = microphoneStream;
    microphoneAudio.removeAttribute("hidden");
  }

  selectMicrophoneSelect.value = deviceId;
};
onCameraDeviceIsConnected((device, isConnected) => {
  if (selectMicrophoneSelect.value != "device") {
    return;
  }
  if (isConnected) {
    selectMicrophone("device");
  } else {
    selectMicrophone("none");
  }
});
const stopMicrophoneStream = () => {
  const device = getDevice();
  if (microphoneStream) {
    if (microphoneStream != device?.microphoneMediaStreamDestination?.stream) {
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
    }
    microphoneStream = undefined;
  }
  microphoneAudio.srcObject = undefined;
  microphoneAudio.setAttribute("hidden", "");
};
navigator.mediaDevices.addEventListener("devicechange", () =>
  updateMicrophoneSources(),
);
updateMicrophoneSources();

/** @type {HTMLVideoElement} */
const cameraRecordingVideoElement = document.getElementById("cameraRecording");
onCameraDeviceConnected((device) => {
  device.addEventListener(
    "cameraRecording",
    (event) => {
      if (cameraRecordingVideoElement.src) {
        URL.revokeObjectURL(cameraRecordingVideoElement.src);
      }
      cameraRecordingVideoElement.src = event.message.url;
    },
    { signal: device.connectionAbortSignal },
  );
  device.addEventListener(
    "microphoneStatus",
    () => {
      if (device.microphoneStatus == "streaming") {
        selectMicrophone("device");
      } else {
        if (selectMicrophoneSelect.value == "device") {
          selectMicrophone("none");
        }
      }
    },
    { signal: device.connectionAbortSignal },
  );
});
