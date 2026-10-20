import * as BW from "./brilliantwear/brilliantwear.module.min.js";

window.BW = BW;

// DEVICE HELPERS

/** @typedef {import("./brilliantwear/brilliantwear.module.min.js").Device} Device */

/** @param {Device} device */
const isDevicePMSG = (device) =>
  device.deviceInformation.modelNumber == "PMSG" &&
  device.hasSensorType("acceleration") &&
  device.hasSensorType("orientation") &&
  device.hasSensorType("tapDetector");
const getDevice = () =>
  BW.DeviceManager.connectedDevices.find((device) => isDevicePMSG(device));

/** @param {(device: Device) => void} callback */
const onPMSGDeviceConnected = (callback) => {
  BW.DeviceManager.addEventListener("deviceConnected", (event) => {
    const { device } = event.message;
    if (isDevicePMSG(device)) {
      callback(device);
    }
  });
};
/** @param {(device: Device) => void} callback */
const onPMSGDeviceNotConnected = (callback) => {
  BW.DeviceManager.addEventListener("deviceNotConnected", (event) => {
    const { device } = event.message;
    if (isDevicePMSG(device) && !getDevice()) {
      callback(device);
    }
  });
};
/** @param {(device: Device, isConnected: boolean) => void} callback */
const onPMSGDeviceIsConnected = (callback) => {
  onPMSGDeviceConnected((device) => callback(device, true));
  onPMSGDeviceNotConnected((device) => callback(device, false));
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
    if (!isDevicePMSG(device)) {
      window.alert("device isn't PMSG - disconnecting now");
      await device.disconnect();
    }
  } else {
    addDeviceButton.innerText = "add device";
  }
  addDeviceButton.disabled = false;
});

onPMSGDeviceIsConnected((device, isConnected) => {
  const hasDevice = Boolean(getDevice());
  addDeviceButton.innerText = hasDevice ? "disconnect" : "add device";
  addDeviceButton.disabled = false;
});

// A-FRAME
const scene = document.querySelector("a-scene");
const targetEntity = scene.querySelector(".target");
const targetPositionEntity = targetEntity.querySelector(".position");
const targetRotationEntity = targetEntity.querySelector(".rotation");

/**
 * @param {import("./brilliantwear/brilliantwear.module.min.js").Vector3?} acceleration
 * @param {number?} timestamp
 */
const updateTargetPositionEntityPosition = (acceleration, timestamp) => {
  const { x, y, z } = acceleration ?? { x: 0, y: 0, z: 0 };
  targetPositionEntity.object3D.position.set(x, y, z).multiplyScalar(0.003);
};
/**
 * @param {import("./brilliantwear/brilliantwear.module.min.js").Euler?} orientation
 * @param {number?} timestamp
 */
const updateTargetRotationEntityPosition = (orientation, timestamp) => {
  // heading is always 0
  const { pitch, heading, roll } = orientation ?? {
    pitch: 0,
    heading: 0,
    roll: 0,
  };
  targetPositionEntity.object3D.rotation.set(
    THREE.MathUtils.degToRad(pitch),
    THREE.MathUtils.degToRad(heading),
    THREE.MathUtils.degToRad(roll),
    "YXZ",
  );
};

// ACCELERATION
/** @type {HTMLButtonElement} */
const toggleAccelerationButton = document.getElementById("toggleAcceleration");
toggleAccelerationButton.addEventListener("click", () => {
  const device = getDevice();
  console.log("toggling sensor", device);
  device?.toggleSensor("acceleration", 20);
});

/** @type {HTMLPreElement} */
const accelerationDataPre = document.getElementById("accelerationData");

const updateToggleAccelerationButton = () => {
  const device = getDevice();

  let innerText = "enable acceleration";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.acceleration > 0
        ? "disable acceleration"
        : "enable acceleration";
    disabled = false;
  }

  toggleAccelerationButton.innerText = innerText;
  toggleAccelerationButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleAccelerationButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleAccelerationButton();
        updateTargetPositionEntityPosition();
      },
      { signal: device.connectionAbortSignal },
    );
    device.addEventListener(
      "acceleration",
      (event) => {
        const { acceleration, timestamp } = event.message;
        accelerationDataPre.textContent = JSON.stringify(
          { acceleration, timestamp },
          null,
          2,
        );
        updateTargetPositionEntityPosition(acceleration, timestamp);
      },
      { signal: device.connectionAbortSignal },
    );
  }
});

// ORIENTATION
/** @type {HTMLButtonElement} */
const toggleOrientationButton = document.getElementById("toggleOrientation");
toggleOrientationButton.addEventListener("click", () => {
  const device = getDevice();
  console.log("toggling sensor", device);
  device?.toggleSensor("orientation", 20);
});

/** @type {HTMLPreElement} */
const orientationDataPre = document.getElementById("orientationData");

const updateToggleOrientationButton = () => {
  const device = getDevice();

  let innerText = "enable orientation";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.orientation > 0
        ? "disable orientation"
        : "enable orientation";
    disabled = false;
  }

  toggleOrientationButton.innerText = innerText;
  toggleOrientationButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleOrientationButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleOrientationButton();
        updateTargetRotationEntityPosition();
      },
      { signal: device.connectionAbortSignal },
    );
    device.addEventListener(
      "orientation",
      (event) => {
        const { orientation, timestamp } = event.message;
        orientationDataPre.textContent = JSON.stringify(
          { orientation, timestamp },
          null,
          2,
        );
        updateTargetRotationEntityPosition(orientation, timestamp);
      },
      { signal: device.connectionAbortSignal },
    );
  }
});

// TAP DETECTOR
/** @type {HTMLButtonElement} */
const toggleTapDetectorButton = document.getElementById("toggleTapDetector");
toggleTapDetectorButton.addEventListener("click", () => {
  const device = getDevice();
  console.log("toggling sensor", device);
  device?.toggleSensor("tapDetector", 20);
});

/** @type {HTMLPreElement} */
const tapDetectorDataPre = document.getElementById("tapDetectorData");

const updateToggleTapDetectorButton = () => {
  const device = getDevice();

  let innerText = "enable tapDetector";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.tapDetector > 0
        ? "disable tapDetector"
        : "enable tapDetector";
    disabled = false;
  }

  toggleTapDetectorButton.innerText = innerText;
  toggleTapDetectorButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleTapDetectorButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleTapDetectorButton();
      },
      { signal: device.connectionAbortSignal },
    );
    device.addEventListener(
      "tapDetector",
      (event) => {
        const { timestamp } = event.message;
        tapDetectorDataPre.textContent = JSON.stringify({ timestamp }, null, 2);
      },
      { signal: device.connectionAbortSignal },
    );
  }
});
