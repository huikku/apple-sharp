This software project accompanies the research paper: Sharp Monocular View Synthesis in Less Than a Second by Lars Mescheder, Wei Dong, Shiwei Li, Xuyang Bai, Marcel Santos, Peiyun Hu, Bruno Lecouat, Mingmin Zhen, Amaël Delaunoy, Tian Fang, Yanghai Tsin, Stephan Richter and Vladlen Koltun.



We present SHARP, an approach to photorealistic view synthesis from a single image. Given a single photograph, SHARP regresses the parameters of a 3D Gaussian representation of the depicted scene. This is done in less than a second on a standard GPU via a single feedforward pass through a neural network. The 3D Gaussian representation produced by SHARP can then be rendered in real time, yielding high-resolution photorealistic images for nearby views. The representation is metric, with absolute scale, supporting metric camera movements. Experimental results demonstrate that SHARP delivers robust zero-shot generalization across datasets. It sets a new state of the art on multiple datasets, reducing LPIPS by 25–34% and DISTS by 21–43% versus the best prior model, while lowering the synthesis time by three orders of magnitude.

Getting started
Please, follow the steps in the code repository to set up your environment. Then you can download the checkpoint from the Files and versions tab above, or use the huggingface-hub CLI:

pip install huggingface-hub
huggingface-cli download --include sharp_2572gikvuh.pt --local-dir . apple/Sharp

To run prediction:

sharp predict -i /path/to/input/images -o /path/to/output/gaussians -c sharp_2572gikvuh.pt

The results will be 3D gaussian splats (3DGS) in the output folder. The 3DGS .ply files are compatible to various public 3DGS renderers. We follow the OpenCV coordinate convention (x right, y down, z forward). The 3DGS scene center is roughly at (0, 0, +z). When dealing with 3rdparty renderers, please scale and rotate to re-center the scene accordingly.

Rendering trajectories (CUDA GPU only)
Additionally you can render videos with a camera trajectory. While the gaussians prediction works for all CPU, CUDA, and MPS, rendering videos via the --render option currently requires a CUDA GPU. The gsplat renderer takes a while to initialize at the first launch.

sharp predict -i /path/to/input/images -o /path/to/output/gaussians --render -c sharp_2572gikvuh.pt

# Or from the intermediate gaussians:
sharp render -i /path/to/output/gaussians -o /path/to/output/renderings  -c sharp_2572gikvuh.pt

Evaluation
Please refer to the paper for both quantitative and qualitative evaluations. Additionally, please check out this qualitative examples page containing several video comparisons against related work.

Citation
If you find our work useful, please cite the following paper:

@inproceedings{Sharp2025:arxiv,
  title      = {Sharp Monocular View Synthesis in Less Than a Second},
  author     = {Lars Mescheder and Wei Dong and Shiwei Li and Xuyang Bai and Marcel Santos and Peiyun Hu and Bruno Lecouat and Mingmin Zhen and Ama\"{e}l Delaunoy and Tian Fang and Yanghai Tsin and Stephan R. Richter and Vladlen Koltun},
  journal    = {arXiv preprint arXiv:2512.10685},
  year       = {2025},
  url        = {https://arxiv.org/abs/2512.10685},
}

Acknowledgements
Our codebase is built using multiple opensource contributions, please see ACKNOWLEDGEMENTS for more details.