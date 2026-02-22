-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  website TEXT,
  labels TEXT[] NOT NULL DEFAULT '{}',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'Gateway' CHECK (tier IN ('Gateway', 'Intermediate', 'Advanced')),
  equipment TEXT NOT NULL DEFAULT '',
  estimated_completion TEXT NOT NULL DEFAULT '',
  people TEXT[] NOT NULL DEFAULT '{}',
  demo_videos TEXT[],
  open_positions TEXT,
  prompt_question TEXT NOT NULL DEFAULT 'Why do you want to join this project and what would you contribute?',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active projects" ON public.projects
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can view all projects" ON public.projects
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert projects" ON public.projects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update projects" ON public.projects
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete projects" ON public.projects
  FOR DELETE USING (auth.role() = 'authenticated');

-- Project selections table
CREATE TABLE IF NOT EXISTS public.project_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 3),
  prompt_answer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, rank),
  UNIQUE(application_id, project_id)
);

ALTER TABLE public.project_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own selections" ON public.project_selections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = project_selections.application_id
      AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own selections" ON public.project_selections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = project_selections.application_id
      AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own selections" ON public.project_selections
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = project_selections.application_id
      AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own selections" ON public.project_selections
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = project_selections.application_id
      AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can view all selections" ON public.project_selections
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seed project data
INSERT INTO public.projects (name, blurb, website, labels, contact_name, contact_email, tier, equipment, estimated_completion, people, open_positions, prompt_question, display_order) VALUES
(
  'XR Club x Vuse XR - StructureSpace',
  'StructureSpace is a web-based XR experience exploring a fundamentally new way to teach one of computer science''s most notoriously difficult subjects. Rather than learning data structures through static textbook diagrams and abstract explanations, users step into an immersive environment where a guided narrator walks them through concepts like trees with real-time 3D visualizations, then challenges them to physically interact with and manipulate objects to prove their understanding. The project is built entirely on Vuse XR''s no-code web platform and deploys directly to Meta Quest 2/3 headsets through the browser, meaning no software installation or account is needed for anyone to jump in. The team has already shipped a working MVP prototype demonstrating tree visualizations and is expanding this semester to tackle more complex data structures with deeper, richer interactive experiences. No prior experience is required to join, though basic 3D modeling knowledge is a plus, and you''ll be fully trained on the Vuse XR platform by the team before getting started.',
  'https://www.vuse-xr.de/',
  ARRAY['No-Code', 'Partnership/Collaboration'],
  'Russell Mehta', 'rmehta27@umd.edu', 'Gateway', 'Quest 3', 'May 2026',
  ARRAY['Abdullah Waris', 'Juan Hernandez'],
  'Project Lead (at least a sophomore)',
  'Why do you want to join this project and what would you contribute?',
  1
),
(
  'XR Club x VIRNECT - Phobia Lab',
  'Phobia Lab is a VR experience that puts you face-to-face with fears you''ve never had, designed to push the boundaries of what''s possible with VIRNECT''s no-code XR platform. VIRNECT''s tools are built for industrial training and corporate demos, so the team set out to take the platform somewhere it was never intended to go: crafting deeply immersive and intense phobia simulations that make you genuinely feel what it''s like to live with fears like nyctophobia (fear of darkness). The experience is adaptive, responding to how you react and interact with the environment to build tension creatively. Beyond being an intense and unforgettable experience, the project is rooted in building real empathy by letting people step into the lived reality of phobias they don''t personally have. The team has already completed their first simulation on the fear of darkness on Meta Quest 3 and is now expanding to build out additional phobia experiences by the end of the semester. No prior experience is required to join, and you''ll be trained on the VIRNECT platform by the team before getting started.',
  'https://virnect.com/',
  ARRAY['No-Code', 'Partnership/Collaboration'],
  'Dinushka Jagodige', 'djagodig@umd.edu', 'Gateway', 'Quest 3', 'May 2026',
  ARRAY['Dinushka Jagodige', 'Ronit Munshi', 'Ricky Jiang', 'Oliver Blevins'],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  2
),
(
  'XR Club x UMD Athletics - The Athlete''s Eye',
  'The Athlete''s Eye is an immersive recording experience built in partnership with UMD Athletics IT to completely rethink how the university recruits student-athletes. Instead of traditional campus tours and highlight reels, recruits put on a headset and are transported onto the field, inside the facilities, and through the spaces they''d actually be living and competing in, all from a perspective they''d never get from a standard visit. The team is using Insta360 cameras to capture exclusive footage across UMD''s stadiums, training facilities, and live games, then compiling it into cinematic VR experiences viewable on Meta Quest 3. Beyond just filming, the team is actively experimenting with 360 filmmaking as a new storytelling medium, exploring how camera angles, movement, and spatial framing can express ideas and emotion in ways traditional video simply can''t. The project is currently in active production with demo footage already completed and more recordings being captured from upcoming games and events. No prior experience is required to join, though any background in video production or 3D workflows is a plus.',
  'https://athleticsit.umd.edu/',
  ARRAY['No-Code', 'Partnership/Collaboration'],
  'Victor Casado', 'vcasado@umd.edu', 'Gateway', 'Insta360, Quest 3', '1 year',
  ARRAY['Victor Casado', 'Jonathan Rich', 'Raymond Le'],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  3
),
(
  'XR Club x Meta Reality Labs - Project ARIA',
  'Project ARIA is an egocentric AI research project conducted in partnership with Meta Reality Labs and under the mentorship of Professor Ming Lin, exploring whether AI can understand a person''s emotional and psychological state purely by observing how the world reacts to them. Using Meta''s ARIA Gen 2 research glasses, the team is building a published dataset that captures rich first-person sensor data during real social interactions, then developing models that infer the wearer''s emotional behavior not from biometrics or self-reporting, but from the external cues and reactions of the people around them. It''s a fundamentally different approach to affective computing: instead of looking inward at the subject, you look outward at how their presence changes the room. The project involves heavy work in computer vision, machine learning, and AI, with the team leveraging Meta''s open-source Project Aria tools and Machine Perception Services for data processing and analysis. This is a long-term research effort and one of the club''s most technically ambitious undertakings.',
  'https://www.projectaria.com/',
  ARRAY['Coding Required', 'Partnership/Collaboration'],
  'Russell Mehta', 'rmehta27@umd.edu', 'Advanced', 'Meta ARIA Gen 2 Wearables', '1 year',
  ARRAY['Russell Mehta', 'Saunak Roy', 'Chanakya Maddineni', 'Mohan Vamsi', 'Javin Ahuja', 'Suchismit Ghosh'],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  4
),
(
  'The Rosetta Engine',
  'The Rosetta Engine is a brain-computer interface research project attempting to fundamentally change how humans communicate. The project is exploring how to translate raw brain activity into structured visual thought, building toward a future where the way we express ideas is no longer bottlenecked by the limitations of language alone. Using the Emotiv EPOC X headset, the team is developing a communication interpretation pipeline that maps neural signals to visual outputs, starting with successful stimuli distinction tests and working toward a system that can externalize a person''s chain of reasoning and thought process in real time. Think of it as building the decoder ring for the human mind. The project is in early-stage development under the mentorship of NIH researcher and HCIL faculty member Elia Shahbazi, with the team currently deep in accelerated research to understand the landscape of BCI, signal processing, and neural decoding at the level needed to make this real. This is a long-term effort and the most ambitious project in the club''s portfolio.',
  NULL,
  ARRAY['Coding Required (Python, Javascript)', 'XRC-initiated'],
  'Russell Mehta', 'rmehta27@umd.edu', 'Advanced', 'Emotiv Epoc X', '1 year',
  ARRAY['Russell Mehta', 'Tamanna Jindal', 'Robert Tzou', 'Sangeetha Sree Selva Kumar'],
  '2 BCI Developers (experienced with signal processing and knows ML, can learn fast)',
  'Why do you want to join this project and what would you contribute?',
  5
),
(
  'Tron XR',
  'Tron XR is a mixed reality disc battle game built in Unity for Meta Quest 3, inspired by the franchise that shaped how an entire generation thinks about the digital frontier. The concept brings the Tron universe into your physical space: a wall in your room tears open into the digital world, and digital artifacts begin crossing over into your reality. Your job is to take them out using the iconic disc in fast-paced combat against an NPC opponent. The team is deep in experimenting with novel game mechanics, custom shaders, and creative XR development techniques to make the experience feel like nothing else out there, pushing mixed reality beyond standard passthrough demos into something that genuinely blurs where your room ends and the digital world begins. The project is currently in early development and is one of the club''s most creatively driven builds, combining technical XR development with strong artistic vision. This is an independent fan project and is not affiliated with or endorsed by Disney or the Tron franchise.',
  NULL,
  ARRAY['Coding Required (C# & Unity)', 'XRC-initiated'],
  'Abdur-Rahman Shakir', 'arshakir@umd.edu', 'Intermediate', 'Quest 3', '1 year',
  ARRAY['Mei Lu', 'Abdur-Rahman Shakir', 'Andy Diep', 'Alice Wang'],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  6
),
(
  'XR Club x Doublepoint - Tactura',
  'Tactura is a research project exploring how to turn a standard smartwatch into a wearable communication device for people with disabilities who use ASL. In partnership with Doublepoint, the team is developing a synthetic gestural language that maps intuitive wrist and hand gestures to phonetic units, enabling real-time gesture-to-speech translation through smartwatch IMU sensors. The design is grounded in cherology, the linguistic breakdown of sign language components, with the goal of creating a system that is both naturally learnable and precise enough for fluid communication. The team is currently working with Samsung Galaxy Watch 7 and Doublepoint''s TouchSDK to build out the gesture recognition pipeline, soon transitioning to Doublepoint''s Dev Kit. The project sits at the intersection of HCI, wearable computing, and accessibility research, supported by HCIL faculty mentorship to ensure the work creates real, meaningful impact. Tactura is currently in the research and experimentation phase as the team works through gesture mapping and pipeline architecture before moving into full implementation.',
  'https://www.doublepoint.com/',
  ARRAY['Coding Required (C#, Unity, Python)', 'Partnership/Collaboration'],
  'Pallavi Kothapalli', 'kpallavi@umd.edu', 'Intermediate', 'Doublepoint Dev Kit, Samsung Galaxy Watch 7', '1 year',
  ARRAY['Pallavi Kothapalli', 'Dhruv Hegde', 'Amit Reich'],
  'TBA',
  'Why do you want to join this project and what would you contribute?',
  7
),
(
  'Beyond the Classroom',
  'Beyond the Classroom is a research-driven project led by a PhD student in Education exploring what effective teaching and learning should actually look like in immersive digital environments. Rather than simply recreating a traditional classroom in VR, the project is investigating the deeper mechanics of how people learn in spatial, interactive spaces and building an experience that can match or surpass the quality of in-person instruction. The current prototype is a Unity-built VR learning environment on Meta Quest 3 that combines structured lessons with interactive elements, and the team is now working to integrate AI-powered NPC instructors and adaptive coaching systems that can respond to how a learner is engaging with the material in real time. The project isn''t locked to any single subject area. Instead it''s focused on the foundational question of how to make digital education genuinely work, treating XR and AI as tools that need to earn their place in the learning process.',
  NULL,
  ARRAY['Coding Required', 'XRC-initiated'],
  'Dean Haynes', 'jhaynes2@umd.edu', 'Intermediate', 'Quest 3', '2 years',
  ARRAY['Dean Haynes'],
  'Unity Developer, Gameplay/AI Engineer, Level/UX Designer',
  'Why do you want to join this project and what would you contribute?',
  8
),
(
  'Immersive Installations',
  'Immersive Installations is a creative project focused on building large-scale immersive experiences using projectors and interactive media. The team explores how projection mapping, spatial audio, and responsive environments can transform physical spaces into living, breathing installations that react to the people inside them. The project draws on techniques from TouchDesigner, creative coding, and physical computing to create experiences that blur the line between digital art and physical environment. Whether it''s turning a room into an interactive light show or building a responsive audiovisual piece for an event, the team is pushing what''s possible with accessible, non-headset-based immersive tech.',
  NULL,
  ARRAY['No-Code', 'XRC-initiated'],
  'Xael Shan', 'xaelshan@umd.edu', 'Intermediate', 'Projectors', '2 years',
  ARRAY['Dean Haynes'],
  'TouchDesigner Creators (anyone with any amount of experience in TouchDesigner)',
  'Why do you want to join this project and what would you contribute?',
  9
),
-- New projects (established partnerships, scope TBD)
(
  'XR Club x Niantic - Niantic Spatial',
  'Niantic is the AR technology company behind Pokemon GO and Ingress. They build the Niantic Real World Platform, a suite of developer tools for cloud AR, spatial mapping, visual positioning, and real-world interactive experiences. Their tech stack includes the Lightship ARDK for Unity, 8th Wall for web-based AR, and VPS (Visual Positioning System) for location-anchored content.',
  'https://nianticlabs.com/',
  ARRAY['Partnership/Collaboration', 'New Project'],
  '', '', 'Advanced', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  10
),
(
  'Neural Lab',
  'A new XRC-initiated research project exploring the intersection of neural interfaces and immersive technology. Expected to involve brain-computer interface hardware, signal processing, and real-time data visualization in XR environments.',
  NULL,
  ARRAY['XRC-initiated', 'New Project'],
  '', '', 'Advanced', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  11
),
(
  'XR Club x UMD Athletics - Game Day',
  'Expanding on the club''s existing partnership with UMD Athletics IT, this project will bring immersive experiences to game day events and athletic programs. Expected to involve 360 video production, real-time VR experiences, and fan engagement through spatial media on Meta Quest headsets.',
  'https://athleticsit.umd.edu/',
  ARRAY['Partnership/Collaboration', 'New Project'],
  '', '', 'Intermediate', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  12
),
(
  'XRC x App Dev',
  'A cross-club collaboration with the App Dev Club combining mobile and web application development with extended reality. Expected to involve frameworks like React Native, Swift, Kotlin, and WebXR to build applications that bridge traditional app experiences with immersive XR features.',
  NULL,
  ARRAY['Partnership/Collaboration', 'New Project'],
  '', '', 'Advanced', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  13
),
(
  'XR Club x Paraverse Technology',
  'Paraverse Technology is a Hong Kong-based company that provides enterprise-grade 3D XR cloud streaming and decentralized rendering solutions. Their flagship product LarkXR enables real-time cloud streaming of XR content to headsets and browsers, used by over 1,000 enterprise partners worldwide across education, digital twins, medical rehabilitation, and gaming.',
  'https://paraverse.cc/',
  ARRAY['Partnership/Collaboration', 'New Project'],
  '', '', 'Intermediate', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  14
),
(
  'XR Club x TanitXR',
  'Tanit XR is a heritage preservation organization that uses photogrammetry, LiDAR scanning, and XR technology to create permanent digital archives of endangered historical and archaeological sites like Carthage and Dougga in Tunisia. Their work ensures that even if physical sites are lost to climate change or erosion, high-fidelity 3D records survive for schools, museums, and future generations.',
  'https://tanitxr.org/',
  ARRAY['Partnership/Collaboration', 'New Project'],
  '', '', 'Intermediate', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  15
),
(
  'XR Club x XGRIDS',
  'XGRIDS is a spatial computing company that builds handheld LiDAR scanners like the Lixel, panoramic cameras like the PortalCam, and AI-powered 3D reconstruction software. Their tools use Gaussian Splatting and multi-SLAM algorithms to create high-precision digital twins for surveying, smart cities, tourism, and manufacturing.',
  'https://xgrids.com/',
  ARRAY['Partnership/Collaboration', 'New Project'],
  '', '', 'Intermediate', '', '',
  ARRAY[]::TEXT[],
  NULL,
  'Why do you want to join this project and what would you contribute?',
  16
);
