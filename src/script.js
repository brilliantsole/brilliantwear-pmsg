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
  device.setCameraConfiguration({ resolution });
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
